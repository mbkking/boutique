"use server";

import { z } from "zod";
import {
  AUDIT_ACTIONS,
  logAuditEntry,
} from "@/lib/services/audit";
import { notifyOrderStatusChange } from "@/lib/services/notifications";
import { canTransitionTo, getOrderStatusLabel } from "@/lib/services/orders";
import { releaseStock } from "@/lib/services/inventory";
import { createAdminClient, type SupabaseAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { safeQuery, toList, toSingle } from "@/lib/data/safe";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";
import type { Order, OrderStatus, UserRole } from "@/types";

const baseOrderSchema = z.object({
  orderId: z.string().uuid("Identifiant de commande invalide"),
  notes: z.string().trim().max(500).optional().nullable(),
});

const confirmOrderSchema = baseOrderSchema;

const prepareOrderSchema = baseOrderSchema;

const readyForDeliveryOrderSchema = baseOrderSchema;

const assignDeliverySchema = baseOrderSchema.extend({
  driverId: z.string().uuid("Identifiant de livreur invalide"),
  zoneId: z.string().uuid("Zone de livraison invalide").optional().nullable(),
});

const cancelOrderSchema = baseOrderSchema.extend({
  reason: z.string().trim().min(3, "Le motif d'annulation est requis").max(300),
});

async function getAdminClient(): Promise<SupabaseAdminClient | null> {
  try {
    return await createAdminClient();
  } catch {
    return null;
  }
}

async function loadOrder(supabase: SupabaseAdminClient, orderId: string): Promise<Order | null> {
  const outcome = await safeQuery("adminOrders.load", (client) =>
    client.from("orders").select("*").eq("id", orderId).limit(1)
  );
  return toSingle(outcome) as Order | null;
}

/** Statuts à partir desquels une commande peut encore être annulée. */
const CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_DELIVERY",
];

interface TransitionContext {
  supabase: SupabaseAdminClient;
  order: Order;
  actorId: string;
  actorRole: UserRole;
  notes: string | null;
}

/**
 * Applique une transition de statut autorisée :
 * - refus des transitions illégales via `canTransitionTo` ;
 * - écriture de l'historique, de l'audit et de la notification.
 */
async function applyTransition(
  context: TransitionContext,
  targetStatus: OrderStatus,
  auditAction: string
): Promise<ActionResult<{ orderNumber: string; status: OrderStatus }>> {
  const { supabase, order, actorId, actorRole, notes } = context;

  if (!canTransitionTo(order.status, targetStatus)) {
    return failure(
      `Transition impossible : une commande « ${getOrderStatusLabel(order.status)} » ne peut pas devenir « ${getOrderStatusLabel(targetStatus)} ».`
    );
  }

  const updated = await supabase
    .from("orders")
    .update({ status: targetStatus, updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", order.status)
    .select("id");

  if (updated.error) {
    console.warn("[admin/orders] transition impossible :", updated.error.message);
    return failure("Le statut de la commande n'a pas pu être mis à jour.");
  }

  if (updated.data && updated.data.length === 0) {
    return failure("La commande a été modifiée entre-temps. Actualisez la page puis réessayez.");
  }

  await supabase.from("order_status_history").insert({
    order_id: order.id,
    status: targetStatus,
    notes,
    created_by: actorId,
  });

  await logAuditEntry(supabase, {
    actor_id: actorId,
    actor_role: actorRole,
    action: auditAction,
    entity_type: "order",
    entity_id: order.id,
    before: { status: order.status },
    after: { status: targetStatus, notes: notes ?? null },
  });

  await notifyOrderStatusChange({
    status: targetStatus,
    orderId: order.id,
    orderNumber: order.order_number,
    customerId: order.customer_id,
  });

  return success({ orderNumber: order.order_number, status: targetStatus });
}

/** Confirme une commande en attente (validation par téléphone). */
export async function confirmOrderAction(
  payload: unknown
): Promise<ActionResult<{ orderNumber: string; status: OrderStatus }>> {
  const auth = await requirePermission(PERMISSIONS.ORDER_CONFIRM);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = confirmOrderSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le service de commandes est momentanément indisponible.");

  const order = await loadOrder(supabase, parsed.data.orderId);
  if (!order) return failure("Commande introuvable.");

  return applyTransition(
    {
      supabase,
      order,
      actorId: auth.profile.id,
      actorRole: auth.profile.role,
      notes: parsed.data.notes ?? "Commande confirmée par notre équipe.",
    },
    "CONFIRMED",
    AUDIT_ACTIONS.ORDER_CONFIRMED
  );
}

/** Passe une commande confirmée en préparation (mise en rayon). */
export async function prepareOrderAction(
  payload: unknown
): Promise<ActionResult<{ orderNumber: string; status: OrderStatus }>> {
  const auth = await requirePermission(PERMISSIONS.ORDER_PREPARE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = prepareOrderSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le service de commandes est momentanément indisponible.");

  const order = await loadOrder(supabase, parsed.data.orderId);
  if (!order) return failure("Commande introuvable.");

  return applyTransition(
    {
      supabase,
      order,
      actorId: auth.profile.id,
      actorRole: auth.profile.role,
      notes: parsed.data.notes ?? "Commande en cours de préparation.",
    },
    "PREPARING",
    AUDIT_ACTIONS.ORDER_STATUS_CHANGED
  );
}

/**
 * Signale une commande en préparation comme prête à être confiée à un livreur.
 *
 * Le stock reste réservé à ce stade : il n'est libéré qu'à l'annulation, via
 * `releaseStock`, et consume par le service d'inventaire.
 */
export async function markReadyForDeliveryAction(
  payload: unknown
): Promise<ActionResult<{ orderNumber: string; status: OrderStatus }>> {
  const auth = await requirePermission(PERMISSIONS.ORDER_PREPARE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = readyForDeliveryOrderSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le service de commandes est momentanément indisponible.");

  const order = await loadOrder(supabase, parsed.data.orderId);
  if (!order) return failure("Commande introuvable.");

  return applyTransition(
    {
      supabase,
      order,
      actorId: auth.profile.id,
      actorRole: auth.profile.role,
      notes: parsed.data.notes ?? "Commande prête pour livraison.",
    },
    "READY_FOR_DELIVERY",
    AUDIT_ACTIONS.ORDER_STATUS_CHANGED
  );
}

/**
 * Affecte un livreur à une commande prête.
 * Crée la livraison si elle n'existe pas encore, sinon la met à jour.
 */
export async function assignDeliveryAction(
  payload: unknown
): Promise<ActionResult<{ orderNumber: string; status: OrderStatus; deliveryId: string }>> {
  const auth = await requirePermission(PERMISSIONS.ORDER_ASSIGN_DELIVERY);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = assignDeliverySchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le service de livraisons est momentanément indisponible.");

  const order = await loadOrder(supabase, parsed.data.orderId);
  if (!order) return failure("Commande introuvable.");

  const driver = await safeQuery("adminOrders.driver", (client) =>
    client
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", parsed.data.driverId)
      .limit(1)
  );
  const driverRow = toSingle(driver);

  if (!driverRow || driverRow.role !== "driver" || !driverRow.is_active) {
    return failure("Le livreur sélectionné est invalide ou inactif.");
  }

  const transition = await applyTransition(
    {
      supabase,
      order,
      actorId: auth.profile.id,
      actorRole: auth.profile.role,
      notes: parsed.data.notes ?? `Livreur affecté : ${driverRow.full_name}.`,
    },
    "ASSIGNED",
    AUDIT_ACTIONS.DELIVERY_ASSIGNED
  );

  if (!transition.success) return transition;

  const existingDelivery = await safeQuery("adminOrders.delivery", (client) =>
    client.from("deliveries").select("id").eq("order_id", order.id).limit(1)
  );
  const existing = toSingle(existingDelivery);

  const now = new Date().toISOString();
  let deliveryId: string | null = null;

  if (existing) {
    const updated = await supabase
      .from("deliveries")
      .update({
        driver_id: driverRow.id,
        zone_id: parsed.data.zoneId ?? null,
        status: "ASSIGNED",
        assigned_at: now,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select("id")
      .single();

    if (updated.error) {
      console.warn("[admin/orders] affectation livraison impossible :", updated.error.message);
      return failure("La commande est assignée mais la livraison n'a pas pu être mise à jour.");
    }
    deliveryId = updated.data.id;
  } else {
    const created = await supabase
      .from("deliveries")
      .insert({
        order_id: order.id,
        driver_id: driverRow.id,
        zone_id: parsed.data.zoneId ?? null,
        status: "ASSIGNED",
        assigned_at: now,
      })
      .select("id")
      .single();

    if (created.error) {
      console.warn("[admin/orders] création livraison impossible :", created.error.message);
      return failure("La commande est assignée mais la livraison n'a pas pu être créée.");
    }
    deliveryId = created.data.id;
  }

  await supabase.from("delivery_events").insert({
    delivery_id: deliveryId,
    status: "ASSIGNED",
    notes: `Affectation à ${driverRow.full_name}.`,
    created_by: auth.profile.id,
  });

  return success({
    orderNumber: order.order_number,
    status: "ASSIGNED",
    deliveryId: deliveryId ?? "",
  });
}

/**
 * Annule une commande et libère le stock réservé.
 * Une commande déjà livrée, retournée ou annulée ne peut jamais être annulée.
 */
export async function cancelOrderAction(
  payload: unknown
): Promise<ActionResult<{ orderNumber: string; status: OrderStatus }>> {
  const auth = await requirePermission(PERMISSIONS.ORDER_CANCEL);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = cancelOrderSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le service de commandes est momentanément indisponible.");

  const order = await loadOrder(supabase, parsed.data.orderId);
  if (!order) return failure("Commande introuvable.");

  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    if (order.status === "DELIVERED") {
      return failure("Cette commande a déjà été livrée : elle ne peut plus être annulée.");
    }
    return failure(
      `Une commande « ${getOrderStatusLabel(order.status)} » ne peut plus être annulée.`
    );
  }

  const transition = await applyTransition(
    {
      supabase,
      order,
      actorId: auth.profile.id,
      actorRole: auth.profile.role,
      notes: `Annulation : ${parsed.data.reason}`,
    },
    "CANCELLED",
    AUDIT_ACTIONS.ORDER_CANCELLED
  );

  if (!transition.success) return transition;

  // Libération du stock réservé (la commande annulée ne partira pas en livraison).
  const itemsOutcome = await safeQuery("adminOrders.items", (client) =>
    client.from("order_items").select("variant_id, quantity").eq("order_id", order.id)
  );

  for (const item of toList(itemsOutcome)) {
    if (typeof item.variant_id !== "string" || typeof item.quantity !== "number") continue;
    await releaseStock(supabase, item.variant_id, item.quantity, order.id, auth.profile.id);
  }

  return success({ orderNumber: order.order_number, status: "CANCELLED" });
}