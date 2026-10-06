"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createAdminClient, type SupabaseAdminClient } from "@/lib/supabase/server";
import { safeQuery, toSingle } from "@/lib/data/safe";
import { AUDIT_ACTIONS, logAuditEntry } from "@/lib/services/audit";
import {
  couponIdSchema,
  couponPatchSchema,
  couponWriteSchema,
} from "@/lib/validations/schemas";
import {
  ActionResult,
  failure,
  firstZodMessage,
  success,
} from "@/lib/actions/types";
import type { CouponScopeType } from "@/lib/domain/coupons";

/**
 * Écritures d'administration sur les codes promo.
 *
 * Chaque action :
 * - vérifie le droit `settings:write` **côté serveur** (les coupons ne
 *   disposent pas encore de permission dédiée : c'est un réglage de boutique) ;
 * - valide la charge utile avec Zod (`lib/validations/schemas.ts`) ;
 * - utilise le client service role : la permission est déjà vérifiée sur la
 *   session, la RLS `coupons_admin_write` reste la défense en profondeur ;
 * - journalise l'opération (`COUPON_CREATED`, `COUPON_UPDATED`,
 *   `COUPON_STATUS_CHANGED`, `COUPON_DELETED`).
 *
 * La remise n'est **jamais** calculée ici : elle revient à `coupon_is_valid`.
 */

type AdminClient = SupabaseAdminClient;

async function getAdminClient(): Promise<AdminClient | null> {
  try {
    return await createAdminClient();
  } catch {
    return null;
  }
}

/**
 * Colonnes de portée depuis le choix du formulaire.
 *
 * `all` remet les deux colonnes à `NULL` : laisser un identifiant résiduel
 * rendrait le coupon « global » tout en le limitant en silence.
 */
function scopeColumns(
  scopeType: CouponScopeType,
  categoryId: string | null | undefined,
  productId: string | null | undefined
): { applies_to_category_id: string | null; applies_to_product_id: string | null } {
  if (scopeType === "category") {
    return { applies_to_category_id: categoryId ?? null, applies_to_product_id: null };
  }
  if (scopeType === "product") {
    return { applies_to_category_id: null, applies_to_product_id: productId ?? null };
  }
  return { applies_to_category_id: null, applies_to_product_id: null };
}

/** Code déjà utilisé (unicité insensible à la casse, index `lower(code)`). */
async function codeExists(supabase: AdminClient, code: string, excludeId?: string) {
  const outcome = await safeQuery("coupons.codeExists", (client) => {
    let builder = client
      .from("coupons")
      .select("id")
      .ilike("code", code)
      .limit(1);
    if (excludeId) builder = builder.neq("id", excludeId);
    return builder;
  });

  return toSingle(outcome) !== null;
}

export async function createCouponAction(
  payload: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = couponWriteSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Les codes promo sont momentanément indisponibles.");

  const input = parsed.data;

  if (await codeExists(supabase, input.code)) {
    return failure(`Le code « ${input.code} » est déjà utilisé.`);
  }

  const { data, error } = await supabase
    .from("coupons")
    .insert({
      code: input.code,
      description: input.description ?? null,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      min_order_amount: input.minOrderAmount,
      max_discount_amount: input.maxDiscountAmount ?? null,
      starts_at: input.startsAt.toISOString(),
      expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
      max_uses: input.maxUses ?? null,
      max_uses_per_user: input.maxUsesPerUser ?? null,
      is_active: input.isActive,
      ...scopeColumns(
        input.scopeType,
        input.appliesToCategoryId,
        input.appliesToProductId
      ),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.warn("[admin/coupons] création impossible :", error?.message);
    return failure("Le code promo n'a pas pu être créé.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.COUPON_CREATED,
    entity_type: "coupon",
    entity_id: data.id,
    after: {
      code: input.code,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      scope_type: input.scopeType,
      is_active: input.isActive,
    },
  });

  revalidatePath("/admin/coupons");
  return success({ id: data.id });
}

export async function updateCouponAction(
  payload: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = couponPatchSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Les codes promo sont momentanément indisponibles.");

  const { id, ...input } = parsed.data;

  if (input.code !== undefined && (await codeExists(supabase, input.code, id))) {
    return failure(`Le code « ${input.code} » est déjà utilisé.`);
  }

  const patch: Record<string, unknown> = {};
  const mapping: Record<string, string> = {
    code: "code",
    description: "description",
    discountType: "discount_type",
    discountValue: "discount_value",
    minOrderAmount: "min_order_amount",
    maxDiscountAmount: "max_discount_amount",
    maxUses: "max_uses",
    maxUsesPerUser: "max_uses_per_user",
    isActive: "is_active",
  };

  for (const [key, column] of Object.entries(mapping)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) patch[column] = value;
  }

  if (input.startsAt !== undefined) patch.starts_at = input.startsAt.toISOString();
  if (input.expiresAt !== undefined) {
    patch.expires_at = input.expiresAt ? input.expiresAt.toISOString() : null;
  }

  // Portée : recalculée en entier à chaque modification du choix, pour ne
  // jamais laisser une cible périmée à côté de l'autre.
  if (input.scopeType !== undefined) {
    Object.assign(
      patch,
      scopeColumns(
        input.scopeType,
        input.appliesToCategoryId,
        input.appliesToProductId
      )
    );
  } else if (input.appliesToCategoryId !== undefined) {
    patch.applies_to_category_id = input.appliesToCategoryId;
    patch.applies_to_product_id = null;
  } else if (input.appliesToProductId !== undefined) {
    patch.applies_to_category_id = null;
    patch.applies_to_product_id = input.appliesToProductId;
  }

  patch.updated_at = new Date().toISOString();

  const beforeOutcome = await safeQuery("coupons.before", (client) =>
    client
      .from("coupons")
      .select(
        "code, description, discount_type, discount_value, min_order_amount, max_discount_amount, starts_at, expires_at, max_uses, max_uses_per_user, is_active, applies_to_category_id, applies_to_product_id"
      )
      .eq("id", id)
      .limit(1)
  );
  const before = toSingle(beforeOutcome) as Record<string, unknown> | null;

  if (!before) return failure("Ce code promo n'existe plus.");

  const { error } = await supabase.from("coupons").update(patch).eq("id", id);

  if (error) {
    console.warn("[admin/coupons] mise à jour impossible :", error.message);
    return failure("Le code promo n'a pas pu être enregistré.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.COUPON_UPDATED,
    entity_type: "coupon",
    entity_id: id,
    before,
    after: patch,
  });

  revalidatePath("/admin/coupons");
  revalidatePath("/admin/coupons/[id]", "page");
  return success({ id });
}

/**
 * Active ou désactive un code.
 *
 * Désactiver est l'opération de tous les jours (un code fuité, une campagne
 * terminée) : elle est séparée de l'édition pour rester un geste unique et
 * tracé à part (`COUPON_STATUS_CHANGED`).
 */
export async function toggleCouponStatusAction(
  payload: unknown
): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = couponIdSchema
    .extend({ isActive: z.boolean() })
    .safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Les codes promo sont momentanément indisponibles.");

  const { id, isActive } = parsed.data;

  const beforeOutcome = await safeQuery("coupons.statusBefore", (client) =>
    client.from("coupons").select("code, is_active").eq("id", id).limit(1)
  );
  const before = toSingle(beforeOutcome) as { code?: string; is_active?: boolean } | null;

  if (!before) return failure("Ce code promo n'existe plus.");

  const { error } = await supabase
    .from("coupons")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.warn("[admin/coupons] changement de statut impossible :", error.message);
    return failure("Le statut du code promo n'a pas pu être modifié.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.COUPON_STATUS_CHANGED,
    entity_type: "coupon",
    entity_id: id,
    before: { is_active: before.is_active ?? null },
    after: { is_active: isActive },
  });

  revalidatePath("/admin/coupons");
  revalidatePath("/admin/coupons/[id]", "page");
  return success({ id, isActive });
}

/**
 * Supprime un code promo **jamais utilisé**.
 *
 * Un code ayant servi (compteur, historique `coupon_usages`, référence sur une
 * commande) doit être désactivé : la suppression casserait l'intégrité de
 * l'historique des commandes et le suivi des remises accordées.
 */
export async function deleteCouponAction(
  payload: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = couponIdSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Les codes promo sont momentanément indisponibles.");

  const { id } = parsed.data;

  const usageOutcome = await safeQuery("coupons.usageForDelete", (client) =>
    client.from("coupon_usages").select("id").eq("coupon_id", id).limit(1)
  );

  const orderOutcome = await safeQuery("coupons.ordersForDelete", (client) =>
    client.from("orders").select("id").eq("coupon_id", id).limit(1)
  );

  if (toSingle(usageOutcome) || toSingle(orderOutcome)) {
    return failure(
      "Ce code promo a déjà été utilisé : désactivez-le plutôt que de le supprimer."
    );
  }

  const { error } = await supabase.from("coupons").delete().eq("id", id);

  if (error) {
    console.warn("[admin/coupons] suppression impossible :", error.message);
    return failure("Le code promo n'a pas pu être supprimé.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.COUPON_DELETED,
    entity_type: "coupon",
    entity_id: id,
    after: { deleted: true },
  });

  revalidatePath("/admin/coupons");
  return success({ id });
}
