"use server";

import { z } from "zod";
import {
  cashCollectionSchema,
  driverStatusUpdateSchema,
} from "@/lib/validations/schemas";
import { AUDIT_ACTIONS, logAuditEntry } from "@/lib/services/audit";
import { notifyOrderStatusChange } from "@/lib/services/notifications";
import { canTransitionTo, getOrderStatusLabel } from "@/lib/services/orders";
import { decrementStock } from "@/lib/services/inventory";
import { createAdminClient, type SupabaseAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { safeQuery, toSingle } from "@/lib/data/safe";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";
import type { Delivery, DeliveryStatus, Order, OrderStatus, PaymentStatus } from "@/types";

const SERVICE_UNAVAILABLE = "Le service de livraison est momentanément indisponible.";

/**
 * Correspondance entre le statut de livraison saisi par le livreur et le statut
 * de commande métier. `null` signifie que le changement ne concernait que la
 * livraison (par exemple une acceptation) et ne déplace pas la commande.
 */
const DELIVERY_TO_ORDER_STATUS: Partial<Record<DeliveryStatus, OrderStatus>> = {
  IN_PREPARATION: "PREPARING",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  ARRIVED: "ARRIVED",
  DELIVERED: "DELIVERED",
  FAILED: "DELIVERY_FAILED",
};

/** Horodatage associé à chaque étape de livraison. */
const DELIVERY_TIMESTAMPS: Partial<Record<DeliveryStatus, string>> = {
  OUT_FOR_DELIVERY: "picked_up_at",
  DELIVERED: "delivered_at",
};

const updateSchema = driverStatusUpdateSchema.extend({
  delivery_id: z.string().uuid("Livraison invalide"),
});

const collectSchema = cashCollectionSchema.extend({
  delivery_id: z.string().uuid("Livraison invalide"),
});

async function getAdminClient(): Promise<SupabaseAdminClient | null> {
  try {
    return await createAdminClient();
  } catch {
    return null;
  }
}

async function loadDelivery(
  supabase: SupabaseAdminClient,
  deliveryId: string
): Promise<Delivery | null> {
  const outcome = await safeQuery("driver.loadDelivery", (client) =>
    client.from("deliveries").select("*").eq("id", deliveryId).limit(1)
  );
  return toSingle(outcome) as Delivery | null;
}

async function loadOrderById(
  supabase: SupabaseAdminClient,
  orderId: string
): Promise<Order | null> {
  const outcome = await safeQuery("driver.loadOrder", (client) =>
    client.from("orders").select("*").eq("id", orderId).limit(1)
  );
  return toSingle(outcome) as Order | null;
}

/**
 * Un livreur ne peut modifier que ses propres livraisons ; l'administrateur
 * intervient sur n'importe laquelle. Ce contrôle est refait côté serveur.
 */
function isAuthorised(
  profile: { id: string; role: string },
  delivery: Delivery
): boolean {
  if (profile.role === "admin") return true;
  return delivery.driver_id === profile.id;
}

/**
 * Met à jour le statut d'une livraison et, lorsqu'il correspond à une étape
 * métier, le statut de la commande associée.
 */
export async function updateDeliveryStatusAction(
  payload: unknown
): Promise<ActionResult<{ deliveryStatus: DeliveryStatus; orderStatus: OrderStatus | null }>> {
  const auth = await requirePermission(PERMISSIONS.DELIVERY_UPDATE_STATUS);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const input = parsed.data;
  const supabase = await getAdminClient();
  if (!supabase) return failure(SERVICE_UNAVAILABLE);

  const delivery = await loadDelivery(supabase, input.delivery_id);
  if (!delivery) return failure("Livraison introuvable.");
  if (!isAuthorised(auth.profile, delivery)) {
    return failure("Cette livraison n'est pas affectée à votre tournée.");
  }

  if (delivery.status === "DELIVERED" || delivery.status === "RETURNED") {
    return failure("Cette livraison est terminée : son statut ne peut plus être modifié.");
  }

  if (input.status === "FAILED" && input.failure_reason) {
    // Un échec sans notes exploitables est refusé par le schéma ; on refuse aussi
    // un motif « autre » sans précision, afin de rester exploitable côté support.
    if (input.failure_reason === "OTHER" && !input.failure_notes) {
      return failure("Précisez la raison de l'échec lorsque le motif est « Autre ».");
    }
  }

  const now = new Date().toISOString();
  const timestampField = DELIVERY_TIMESTAMPS[input.status];

  const updatePayload: Record<string, unknown> = {
    status: input.status,
    failure_reason: input.status === "FAILED" ? input.failure_reason : null,
    failure_notes: input.status === "FAILED" ? (input.failure_notes ?? null) : null,
    updated_at: now,
  };
  if (timestampField) updatePayload[timestampField] = now;

  const updated = await supabase
    .from("deliveries")
    .update(updatePayload)
    .eq("id", delivery.id)
    .eq("status", delivery.status)
    .select("id");

  if (updated.error) {
    console.warn("[driver] mise à jour livraison impossible :", updated.error.message);
    return failure("Le statut de la livraison n'a pas pu être mis à jour.");
  }

  if (updated.data && updated.data.length === 0) {
    return failure("Cette livraison a été modifiée entre-temps. Actualisez la page puis réessayez.");
  }

  await supabase.from("delivery_events").insert({
    delivery_id: delivery.id,
    status: input.status,
    notes: input.notes ?? (input.status === "FAILED" ? input.failure_notes : null),
    created_by: auth.profile.id,
  });

  const targetOrderStatus = DELIVERY_TO_ORDER_STATUS[input.status] ?? null;
  let appliedOrderStatus: OrderStatus | null = null;

  if (targetOrderStatus && delivery.order_id) {
    const order = await loadOrderById(supabase, delivery.order_id);

    if (order) {
      if (canTransitionTo(order.status, targetOrderStatus)) {
        const statusUpdate = await supabase
          .from("orders")
          .update({ status: targetOrderStatus, updated_at: now })
          .eq("id", order.id)
          .eq("status", order.status)
          .select("id");

        if (statusUpdate.error) {
          console.warn("[driver] mise à jour commande impossible :", statusUpdate.error.message);
        } else if (!statusUpdate.data || statusUpdate.data.length > 0) {
          appliedOrderStatus = targetOrderStatus;

          await supabase.from("order_status_history").insert({
            order_id: order.id,
            status: targetOrderStatus,
            notes: input.notes ?? `Livraison : ${input.status}`,
            created_by: auth.profile.id,
          });

          await logAuditEntry(supabase, {
            actor_id: auth.profile.id,
            actor_role: auth.profile.role,
            action: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
            entity_type: "order",
            entity_id: order.id,
            before: { status: order.status },
            after: { status: targetOrderStatus, delivery_status: input.status },
          });

          await notifyOrderStatusChange({
            status: targetOrderStatus,
            orderId: order.id,
            orderNumber: order.order_number,
            customerId: order.customer_id,
          });
        }
      } else {
        // Transition métier illégale : la livraison avance, la commande reste figée.
        console.warn(
          `[driver] transition ignorée : « ${getOrderStatusLabel(order.status)} » vers « ${getOrderStatusLabel(targetOrderStatus)} »`
        );
      }
    }
  }

  return success({ deliveryStatus: input.status, orderStatus: appliedOrderStatus });
}

/**
 * Enregistre un encaissement espèces et met à jour le statut de paiement de la
 * Enregistre un encaissement espèces et met à jour le statut de paiement de la
 * commande : intégral si le montant collecté atteint le total, partiel sinon.
 *
 * Idempotent et transactionnel — voir l'implémentation.
 */
/**
 * Enregistre un encaissement et met à jour le statut de paiement.
 *
 * Idempotent : `p_idempotency_key` est UNIQUE en base (migration 006). Un
 * double envoi, un double-clic ou un rejeu réseau renvoie le même résultat
 * qu'au premier appel, sans créer un second encaissement.
 *
 * Le cumul et le statut de paiement sont calculés **en base**, dans la même
 * transaction que l'insertion. Les calculer en JavaScript après écriture
 * compterait deux fois si deux appels arrivaient concurremment.
 */
export async function collectCashAction(
  payload: unknown
): Promise<ActionResult<{ paymentStatus: PaymentStatus; collectedTotal: number }>> {
  const auth = await requirePermission(PERMISSIONS.DELIVERY_COLLECT_CASH);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = collectSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const input = parsed.data;
  const supabase = await getAdminClient();
  if (!supabase) return failure(SERVICE_UNAVAILABLE);

  // Une clé est exigée : sans elle, aucune garantie de rejeu n'est possible.
  const idempotencyKey = typeof payload === "object" && payload !== null
    ? (payload as { idempotency_key?: unknown }).idempotency_key
    : undefined;

  if (typeof idempotencyKey !== "string" || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    return failure("Clé d'idempotence invalide pour l'encaissement.");
  }

  const delivery = await loadDelivery(supabase, input.delivery_id);
  if (!delivery) return failure("Livraison introuvable.");
  if (!isAuthorised(auth.profile, delivery)) {
    return failure("Cette livraison n'est pas affectée à votre tournée.");
  }

  if (!delivery.order_id) return failure("Cette livraison n'est rattachée à aucune commande.");
  if (delivery.status === "RETURNED") {
    return failure("Les commandes retournées ne peuvent pas faire l'objet d'un encaissement.");
  }

  const order = await loadOrderById(supabase, delivery.order_id);
  if (!order) return failure("Commande introuvable.");

  if (input.expected_amount !== order.total) {
    return failure(
      `Le montant attendu ne correspond pas à la commande (${order.total} FCFA). Vérifiez puis réessayez.`
    );
  }

  if (input.collected_amount > order.total) {
    return failure("Le montant encaissé ne peut pas dépasser le total de la commande.");
  }

  if (input.collected_amount < input.expected_amount && !input.discrepancy_reason) {
    return failure("Précisez la raison de l'écart lorsque le montant encaissé est inférieur.");
  }

  // La fonction SQL `collect_cash` n'accepte que 'CASH' et 'MOBILE_MONEY'.
  // Le vocabulaire de l'application est plus large (`COD` = paiement à la
  // livraison, présenté à l'écran comme « espèces ») : la traduction se fait
  // ici, à la frontière. Sans elle, PostgreSQL refuse l'appel (INVALID_METHOD),
  // la livraison reste enregistrée mais l'encaissement n'est jamais comptabilisé.
  const rpcMethod = input.method === "MOBILE_MONEY" ? "MOBILE_MONEY" : "CASH";

  // Une réponse absente (base injoignable, fonction absente après une migration
  // incomplète) est traitée comme un échec, pas comme une exception : la
  // livraison est déjà enregistrée et l'écran du livreur doit rester utilisable.
  const reponse = await supabase.rpc("collect_cash", {
    p_delivery_id: delivery.id,
    p_order_id: order.id,
    p_expected_amount: input.expected_amount,
    p_collected_amount: input.collected_amount,
    p_method: rpcMethod,
    p_discrepancy_reason: input.discrepancy_reason ?? null,
    p_idempotency_key: idempotencyKey,
  });

  const recordError = reponse?.error ?? null;
  const result = reponse?.data;

  if (recordError) {
    console.warn("[driver] encaissement impossible :", recordError.message);
    return failure("L'encaissement n'a pas pu être enregistré.");
  }

  const row = (Array.isArray(result) ? result[0] : result) as
    | { payment_status?: string; collected_total?: number; already_recorded?: boolean }
    | undefined;

  if (!row || typeof row.collected_total !== "number") {
    return failure("L'encaissement n'a pas pu être enregistré.");
  }

  const paymentStatus = (row.payment_status as PaymentStatus) ?? "COD_PENDING";

  // Sortie physique du stock : la marchandise quitte le dépôt.
  if (delivery.status === "DELIVERED") {
    const itemsOutcome = await safeQuery("driver.orderItems", (client) =>
      client.from("order_items").select("variant_id, quantity").eq("order_id", order.id)
    );

    for (const item of itemsOutcome.data ?? []) {
      if (typeof item.variant_id !== "string" || typeof item.quantity !== "number") continue;
      await decrementStock(supabase, item.variant_id, item.quantity, order.id, auth.profile.id);
    }
  }

  // Un rejeu n'est pas journalisé deux fois : c'est le même encaissement.
  if (!row.already_recorded) {
    await logAuditEntry(supabase, {
      actor_id: auth.profile.id,
      actor_role: auth.profile.role,
      action: AUDIT_ACTIONS.CASH_COLLECTED,
      entity_type: "cash_collection",
      entity_id: idempotencyKey,
      before: { payment_status: order.payment_status },
      after: {
        payment_status: paymentStatus,
        expected_amount: input.expected_amount,
        collected_amount: input.collected_amount,
        discrepancy_reason: input.discrepancy_reason ?? null,
      },
    });
  }

  return success({ paymentStatus, collectedTotal: row.collected_total });
}