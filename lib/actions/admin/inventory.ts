"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { adjustStock, incrementStock, StockResult } from "@/lib/services/inventory";
import { createAdminClient, type SupabaseAdminClient } from "@/lib/supabase/server";
import { safeQuery, toSingle } from "@/lib/data/safe";
import { logAuditEntry, AUDIT_ACTIONS } from "@/lib/services/audit";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";
import type { UserRole } from "@/types";

/**
 * Le motif est obligatoire : le cahier des charges impose qu'aucun ajustement
 * de stock ne puisse être tracé sans justification.
 */
const stockAdjustmentReasonSchema = z
  .string()
  .trim()
  .min(3, "Le motif de l'ajustement est requis (3 caractères minimum)")
  .max(300, "Le motif ne peut pas dépasser 300 caractères");

const adjustStockSchema = z.object({
  variantId: z.string().uuid("Variante invalide"),
  newQuantity: z.number().int().min(0, "Le stock ne peut pas être négatif"),
  reason: stockAdjustmentReasonSchema,
});

const receiveStockSchema = z.object({
  variantId: z.string().uuid("Variante invalide"),
  quantity: z.number().int().min(1, "La quantité reçue doit être d'au moins 1"),
  reason: stockAdjustmentReasonSchema,
});

const updateThresholdSchema = z.object({
  variantId: z.string().uuid("Variante invalide"),
  lowStockThreshold: z.number().int().min(0, "Le seuil ne peut pas être négatif"),
});

async function getAdminClient(): Promise<SupabaseAdminClient | null> {
  try {
    return await createAdminClient();
  } catch {
    return null;
  }
}

/** Confirme que la variante existe avant toute écriture de stock. */
async function variantExists(
  supabase: SupabaseAdminClient,
  variantId: string
): Promise<{ id: string; product_id: string } | null> {
  const outcome = await safeQuery("adminInventory.variant", (client) =>
    client
      .from("product_variants")
      .select("id, product_id")
      .eq("id", variantId)
      .limit(1)
  );
  return toSingle(outcome);
}

function toFailure(result: StockResult): ActionResult<never> {
  return failure(result.error ?? "L'opération sur le stock a échoué.");
}

/**
 * Ajuste une quantité de stock à une valeur cible.
 *
 * Réservé aux rôles détenant `INVENTORY_ADJUST` (administrateur et
 * gestionnaire de stock). Le mouvement et l'entrée d'audit sont écrits par
 * `adjustStock`, qui refuse toute quantité négative.
 */
export async function adjustStockAction(payload: unknown): Promise<ActionResult<{ variantId: string }>> {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_ADJUST);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = adjustStockSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le service de stock est momentanément indisponible.");

  const variant = await variantExists(supabase, parsed.data.variantId);
  if (!variant) return failure("Variante introuvable.");

  const result = await adjustStock(
    supabase,
    parsed.data.variantId,
    parsed.data.newQuantity,
    parsed.data.reason,
    auth.profile.id
  );

  if (!result.success) return toFailure(result);

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.STOCK_ADJUSTED,
    entity_type: "product_variant",
    entity_id: parsed.data.variantId,
    before: null,
    after: {
      newQuantity: parsed.data.newQuantity,
      reason: parsed.data.reason,
    },
  });

  return success({ variantId: parsed.data.variantId });
}

/** Enregistre une entrée de marchandise (réception fournisseur). */
export async function receiveStockAction(payload: unknown): Promise<ActionResult<{ variantId: string }>> {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_ADJUST);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = receiveStockSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le service de stock est momentanément indisponible.");

  const variant = await variantExists(supabase, parsed.data.variantId);
  if (!variant) return failure("Variante introuvable.");

  const result = await incrementStock(
    supabase,
    parsed.data.variantId,
    parsed.data.quantity,
    parsed.data.reason,
    auth.profile.id
  );

  if (!result.success) return toFailure(result);

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.STOCK_RECEIVED,
    entity_type: "product_variant",
    entity_id: parsed.data.variantId,
    after: { quantity: parsed.data.quantity, reason: parsed.data.reason },
  });

  return success({ variantId: parsed.data.variantId });
}

/** Modifie le seuil d'alerte de réapprovisionnement. */
export async function updateStockThresholdAction(
  payload: unknown
): Promise<ActionResult<{ variantId: string }>> {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_ADJUST);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = updateThresholdSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le service de stock est momentanément indisponible.");

  const variant = await variantExists(supabase, parsed.data.variantId);
  if (!variant) return failure("Variante introuvable.");

  const { error } = await supabase
    .from("product_variants")
    .update({ low_stock_threshold: parsed.data.lowStockThreshold, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.variantId);

  if (error) {
    console.warn("[admin/inventory] seuil impossible :", error.message);
    return failure("Le seuil n'a pas pu être mis à jour.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.STOCK_THRESHOLD_UPDATED,
    entity_type: "product_variant",
    entity_id: parsed.data.variantId,
    after: { lowStockThreshold: parsed.data.lowStockThreshold },
  });

  return success({ variantId: parsed.data.variantId });
}

/** Rôle effectif sur le stock, utilisé par l'interface pour masquer le formulaire. */
export type StockActor = { role: UserRole; canAdjust: boolean };