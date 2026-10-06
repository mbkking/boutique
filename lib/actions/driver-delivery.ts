"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createAdminClient, type SupabaseAdminClient } from "@/lib/supabase/server";
import { safeQuery, toSingle } from "@/lib/data/safe";
import { AUDIT_ACTIONS, logAuditEntry } from "@/lib/services/audit";
import { notifyOrderStatusChange } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";
import type { Delivery, Order } from "@/types";

/**
 * Reprise et retour d'une livraison échouée (§11 « Retour », §30 « RESCHEDULED »).
 *
 * Deux issues après un échec :
 * - **reprogrammer** une nouvelle tentative, dans la limite d'un nombre d'essais ;
 * - **retourner** la marchandise au dépôt, ce qui clôt la livraison.
 *
 * Le choix entre les deux appartient à l'exploitation : au-delà du nombre
 * d'essais, la reprise n'est plus proposée. Reprogrammer indéfiniment
 * transformerait un client injoignable en tournée sans fin.
 */

const BUCKET = "delivery-proofs";

/** Au-delà, la livraison doit être retournée plutôt que reprogrammée. */
const MAX_ATTEMPTS = 3;

const rescheduleSchema = z.object({
  delivery_id: z.string().uuid("Livraison invalide"),
  next_attempt_at: z.string().min(10, "Date de nouvelle tentative invalide"),
  reason: z.string().trim().min(3, "Précisez le motif de la reprogrammation").max(300),
});

const returnSchema = z.object({
  delivery_id: z.string().uuid("Livraison invalide"),
  reason: z.string().trim().min(3, "Le motif du retour est obligatoire").max(300),
  /** Confirmation explicite : un retour est irréversible côté client. */
  confirm: z.literal(true, {
    error: "La confirmation du retour est requise.",
  }),
});

const proofSchema = z.object({
  delivery_id: z.string().uuid("Livraison invalide"),
  proof_type: z.enum(["photo", "signature", "confirmation"]),
  /** Contenu encodé en base64. Requis pour une preuve photo. */
  content: z.string().min(1).optional(),
  fileName: z.string().trim().max(255).optional(),
  note: z.string().trim().max(300).optional().nullable(),
});

const MAX_PROOF_BYTES = 4 * 1024 * 1024;
/** Types réellement produits par la vérification des octets. */
type ProofMime = "image/jpeg" | "image/png" | "image/webp";

/** Motifs de refus de la reprogrammation. */
const RESCHEDULE_MESSAGES = {
  DELIVERY_NOT_FOUND: "Livraison introuvable.",
  INVALID_STATUS: "Seule une livraison en échec peut être reprogrammée.",
  MAX_ATTEMPTS_REACHED:
    "Le nombre maximal de tentatives est atteint. La livraison doit être retournée.",
  INVALID_DATE: "La date de nouvelle tentative doit être dans le futur.",
} as const;

type RescheduleFailure = keyof typeof RESCHEDULE_MESSAGES;

async function getAdminClient(): Promise<SupabaseAdminClient | null> {
  try {
    return await createAdminClient();
  } catch {
    return null;
  }
}

/** Vérifie qu'un contenu est bien une image, par ses octets d'en-tête. */
function sniffImage(buffer: Uint8Array): ProofMime | null {
  const is = (offset: number, ...bytes: number[]): boolean =>
    bytes.every((byte, index) => buffer[offset + index] === byte);

  if (buffer.length >= 3 && is(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (buffer.length >= 8 && is(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a)) return "image/png";
  if (
    buffer.length >= 12 &&
    is(0, 0x52, 0x49, 0x46, 0x46) &&
    is(8, 0x57, 0x45, 0x42, 0x50)
  ) {
    return "image/webp";
  }

  return null;
}

/** Charge la livraison et la commande associée, en vérifiant l'affectation. */
async function loadContext(
  supabase: SupabaseAdminClient,
  profileId: string,
  profileRole: string,
  deliveryId: string
): Promise<
  | { ok: false; message: string }
  | { ok: true; delivery: Delivery; order: Order }
> {
  const deliveryOutcome = await safeQuery("deliveryActions.delivery", (client) =>
    client.from("deliveries").select("*").eq("id", deliveryId).limit(1)
  );
  const delivery = toSingle(deliveryOutcome) as Delivery | null;

  if (!delivery) return { ok: false, message: "Livraison introuvable." };

  // Un livreur n'agit que sur ses livraisons ; l'administrateur sur toutes.
  if (profileRole !== "admin" && delivery.driver_id !== profileId) {
    return { ok: false, message: "Cette livraison n'est pas affectée à votre tournée." };
  }

  if (!delivery.order_id) {
    return { ok: false, message: "Cette livraison n'est rattachée à aucune commande." };
  }

  const orderOutcome = await safeQuery("deliveryActions.order", (client) =>
    client.from("orders").select("*").eq("id", delivery.order_id).limit(1)
  );
  const order = toSingle(orderOutcome) as Order | null;

  if (!order) return { ok: false, message: "Commande introuvable." };

  return { ok: true, delivery, order };
}

/**
 * Reprogramme une livraison échouée.
 *
 * La règle du nombre de tentatives est appliquée en base : elle ne dépend pas
 * de ce que le client envoie.
 */
export async function rescheduleDeliveryAction(
  payload: unknown
): Promise<ActionResult<{ attemptCount: number; nextAttemptAt: string }>> {
  const auth = await requirePermission(PERMISSIONS.DELIVERY_UPDATE_STATUS);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = rescheduleSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le service de livraison est momentanément indisponible.");

  const context = await loadContext(
    supabase,
    auth.profile.id,
    auth.profile.role,
    parsed.data.delivery_id
  );
  if (!context.ok) return failure(context.message);

  const nextAttempt = new Date(parsed.data.next_attempt_at);
  if (Number.isNaN(nextAttempt.getTime())) {
    return failure("Date de nouvelle tentative invalide.");
  }

  const { data, error } = await supabase.rpc("reschedule_delivery", {
    p_delivery_id: parsed.data.delivery_id,
    p_next_attempt_at: nextAttempt.toISOString(),
    p_reason: parsed.data.reason,
    p_max_attempts: MAX_ATTEMPTS,
  });

  if (error) {
    logger.warn("delivery: reprogrammation impossible", { error: error.message });
    return failure("La livraison n'a pas pu être reprogrammée.");
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed?: boolean; attempt_count?: number; reason?: string | null }
    | undefined;

  if (!row?.allowed) {
    const reason = (row?.reason ?? "INVALID_STATUS") as RescheduleFailure;
    return failure(RESCHEDULE_MESSAGES[reason] ?? RESCHEDULE_MESSAGES.INVALID_STATUS);
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.DELIVERY_RESCHEDULED,
    entity_type: "delivery",
    entity_id: parsed.data.delivery_id,
    before: { status: context.delivery.status, attempt_count: context.delivery.attempt_count },
    after: {
      status: "RESCHEDULED",
      attempt_count: row.attempt_count,
      next_attempt_at: nextAttempt.toISOString(),
      reason: parsed.data.reason,
    },
  });

  revalidatePath("/driver");
  revalidatePath(`/driver/deliveries/${parsed.data.delivery_id}`);
  return success({
    attemptCount: row.attempt_count ?? 0,
    nextAttemptAt: nextAttempt.toISOString(),
  });
}

/**
 * Retourne une livraison au dépôt.
 *
 * Le stock **n'est pas** décrémenté : la marchandise n'a pas quitté le
 * dossier. Elle est simplement rendue disponible pour une nouvelle expédition.
 * L'historique conserve le motif et l'acteur.
 */
export async function returnDeliveryAction(
  payload: unknown
): Promise<ActionResult<{ deliveryId: string; orderStatus: string }>> {
  const auth = await requirePermission(PERMISSIONS.DELIVERY_UPDATE_STATUS);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = returnSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le service de livraison est momentanément indisponible.");

  const context = await loadContext(
    supabase,
    auth.profile.id,
    auth.profile.role,
    parsed.data.delivery_id
  );
  if (!context.ok) return failure(context.message);

  const { delivery, order } = context;

  if (delivery.status === "DELIVERED") {
    return failure("Une livraison effectuée ne peut pas être retournée depuis la tournée.");
  }
  if (delivery.status === "RETURNED") {
    return failure("Cette livraison a déjà été retournée.");
  }

  const now = new Date().toISOString();

  // Mise à jour conditionnelle : la lecture du statut et l'écriture ne doivent
  // pas être séparées, sinon deux actions simultanées passeraient toutes deux.
  const { data: updated, error } = await supabase
    .from("deliveries")
    .update({
      status: "RETURNED",
      failure_reason: delivery.failure_reason ?? "CUSTOMER_REFUSED",
      failure_notes: `Retour au dépôt : ${parsed.data.reason}`,
      updated_at: now,
    })
    .eq("id", delivery.id)
    .neq("status", "RETURNED")
    .neq("status", "DELIVERED")
    .select("id")
    .single();

  if (error || !updated) {
    return failure("La livraison n'a pas pu être retournée.");
  }

  const { error: orderError } = await supabase
    .from("orders")
    .update({ status: "RETURNED", updated_at: now })
    .eq("id", order.id)
    .neq("status", "DELIVERED");

  if (orderError) {
    logger.warn("delivery: commande non synchronisée après retour", {
      orderId: order.id,
      error: orderError.message,
    });
  }

  await supabase.from("delivery_events").insert({
    delivery_id: delivery.id,
    status: "RETURNED",
    notes: `Retour au dépôt : ${parsed.data.reason}`,
    created_by: auth.profile.id,
  });

  await supabase.from("order_status_history").insert({
    order_id: order.id,
    status: "RETURNED",
    notes: `Marchandise retournée au dépôt : ${parsed.data.reason}`,
    created_by: auth.profile.id,
  });

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.DELIVERY_RETURNED,
    entity_type: "delivery",
    entity_id: delivery.id,
    before: { status: delivery.status },
    after: { status: "RETURNED", reason: parsed.data.reason },
  });

  await notifyOrderStatusChange({
    status: "RETURNED",
    orderId: order.id,
    orderNumber: order.order_number,
    customerId: order.customer_id,
  });

  revalidatePath("/driver");
  revalidatePath(`/driver/deliveries/${delivery.id}`);
  return success({ deliveryId: delivery.id, orderStatus: "RETURNED" });
}

/**
 * Enregistre une preuve de livraison.
 *
 * Le livreur peut photographier le colis remis, relever un accord oral, ou
 * joindre une note. Pour une photo, le contenu est vérifié par ses octets
 * d'en-tête : renommer un fichier `.jpg` ne permet pas de passer une capture
 * d'écran exécutable ou un script.
 */
export async function attachDeliveryProofAction(
  payload: unknown
): Promise<ActionResult<{ proofUrl: string | null; proofType: string }>> {
  const auth = await requirePermission(PERMISSIONS.DELIVERY_UPDATE_STATUS);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = proofSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const input = parsed.data;

  if (input.proof_type === "photo" && !input.content) {
    return failure("Prenez une photo du colis remis pour valider la livraison.");
  }

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le service de livraison est momentanément indisponible.");

  const context = await loadContext(supabase, auth.profile.id, auth.profile.role, input.delivery_id);
  if (!context.ok) return failure(context.message);

  let proofUrl: string | null = null;
  let storedPath: string | null = null;

  if (input.proof_type === "photo" && input.content) {
    let bytes: Uint8Array;
    try {
      const binary = atob(input.content);
      bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    } catch {
      return failure("La photo n'a pas pu être lue.");
    }

    if (bytes.byteLength > MAX_PROOF_BYTES) {
      return failure("Photo trop lourde (maximum 4 Mo).");
    }

    const detected = sniffImage(bytes);
    if (!detected) {
      return failure("Ce fichier n'est pas une image valide.");
    }

    const extension = detected === "image/png" ? "png" : detected === "image/webp" ? "webp" : "jpg";
    const objectName = `${input.delivery_id}-${crypto.randomUUID().slice(0, 12)}.${extension}`;
    storedPath = `${input.delivery_id}/${objectName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storedPath, bytes, { contentType: detected, upsert: false });

    if (uploadError) {
      logger.warn("delivery: preuve non téléversée", { error: uploadError.message });
      return failure("La photo n'a pas pu être enregistrée.");
    }

    proofUrl = supabase.storage.from(BUCKET).getPublicUrl(storedPath).data.publicUrl;
  }

  const proofTypeDb = input.proof_type === "photo" ? "PHOTO" : input.proof_type === "signature" ? "SIGNATURE" : "CONFIRMATION";

  const { error } = await supabase
    .from("deliveries")
    .update({
      proof_type: proofTypeDb,
      proof_url: proofUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.delivery_id);

  if (error) {
    // Le fichier est stocké mais non référencé : on le retire.
    if (storedPath) await supabase.storage.from(BUCKET).remove([storedPath]);
    return failure("La preuve n'a pas pu être enregistrée.");
  }

  if (input.note) {
    await supabase.from("delivery_events").insert({
      delivery_id: input.delivery_id,
      status: context.delivery.status,
      notes: input.note,
      created_by: auth.profile.id,
    });
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.DELIVERY_PROOF_ADDED,
    entity_type: "delivery",
    entity_id: input.delivery_id,
    after: { proof_type: proofTypeDb, has_photo: proofUrl !== null },
  });

  revalidatePath(`/driver/deliveries/${input.delivery_id}`);
  return success({ proofUrl, proofType: proofTypeDb });
}

/** Supprime la preuve enregistrée, avant une reprise par exemple. */
export async function removeDeliveryProofAction(
  payload: unknown
): Promise<ActionResult<{ deliveryId: string }>> {
  const auth = await requirePermission(PERMISSIONS.DELIVERY_UPDATE_STATUS);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = z.object({ delivery_id: z.string().uuid("Livraison invalide") }).safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le service de livraison est momentanément indisponible.");

  const context = await loadContext(supabase, auth.profile.id, auth.profile.role, parsed.data.delivery_id);
  if (!context.ok) return failure(context.message);

  const { error } = await supabase
    .from("deliveries")
    .update({ proof_type: null, proof_url: null, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.delivery_id);

  if (error) return failure("La preuve n'a pas pu être supprimée.");

  revalidatePath(`/driver/deliveries/${parsed.data.delivery_id}`);
  return success({ deliveryId: parsed.data.delivery_id });
}