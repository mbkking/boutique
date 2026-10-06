"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/server";
import { logAuditEntry, AUDIT_ACTIONS } from "@/lib/services/audit";
import { logger } from "@/lib/observability/logger";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";

/**
 * �%critures d'administration sur les promotions.
 *
 * Comme pour les codes promo, le calcul de la remise reste cote serveur (la
 * commande ne fait jamais confiance au navigateur) : cette action ne fait
 * qu'enregistrer les règles.
 */

const promotionSchema = z.object({
  name: z.string().trim().min(2, "Nom requis").max(120),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
  value: z.coerce.number().int().min(0).max(100_000_000),
  minOrderAmount: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  isActive: z.boolean().default(true),
});

export async function createPromotionAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = promotionSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));
  if (parsed.data.type === "PERCENTAGE" && parsed.data.value > 100) {
    return failure("Un pourcentage ne peut pas dépasser 100.");
  }
  if (Date.parse(parsed.data.endsAt) < Date.parse(parsed.data.startsAt)) {
    return failure("La date de fin doit être postérieure au début.");
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("promotions")
    .insert({
      name: parsed.data.name,
      type: parsed.data.type,
      value: parsed.data.value,
      min_order_amount: parsed.data.minOrderAmount ?? null,
      starts_at: new Date(parsed.data.startsAt).toISOString(),
      ends_at: new Date(parsed.data.endsAt).toISOString(),
      is_active: parsed.data.isActive,
    })
    .select("id")
    .single();

  if (error || !data) {
    logger.warn("promotions: création refusée", { error: error?.message });
    return failure("La promotion n'a pas pu être créée.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.COUPON_CREATED,
    entity_type: "promotions",
    entity_id: data.id,
    after: { name: parsed.data.name, type: parsed.data.type, value: parsed.data.value },
  });

  revalidatePath("/admin/promotions");
  return success({ id: data.id });
}

export async function togglePromotionAction(id: string, isActive: boolean): Promise<ActionResult<object>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("promotions")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logger.warn("promotions: bascule refusée", { error: error.message });
    return failure("La promotion n'a pas pu être modifiée.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.COUPON_STATUS_CHANGED,
    entity_type: "promotions",
    entity_id: id,
    after: { is_active: isActive },
  });

  revalidatePath("/admin/promotions");
  return success({});
}

export async function deletePromotionAction(id: string): Promise<ActionResult<object>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const supabase = await createAdminClient();
  const { error } = await supabase.from("promotions").delete().eq("id", id);

  if (error) {
    logger.warn("promotions: suppression refusée", { error: error.message });
    return failure("La promotion n'a pas pu être supprimée.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.COUPON_DELETED,
    entity_type: "promotions",
    entity_id: id,
  });

  revalidatePath("/admin/promotions");
  return success({});
}
