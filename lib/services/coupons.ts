import "server-only";

import { buildLikePatterns, safeQuery, toList, toSingle } from "@/lib/data/safe";
import {
  applyDiscount,
  couponUserKey,
  normalizeCouponCode,
} from "@/lib/domain/coupons";
import { logger } from "@/lib/observability/logger";
import type {
  Coupon,
  CouponRejectionReason,
  CouponValidation,
} from "@/types";

/**
 * Codes promo.
 *
 * Principe : le client saisit un code, **jamais un montant**. La remise est
 * calculée par la fonction PostgreSQL `coupon_is_valid`, qui lit la base et
 * applique toutes les règles — activation, fenêtre de dates, nombre
 * d'utilisations, minimum de commande, plafond, et la **portée**
 * catégorie/produit.
 *
 * Calculer la remise en JavaScript exposerait la logique à la modification et
 * permettrait de forger une remise arbitraire. Les miroirs TypeScript de
 * `lib/domain/coupons.ts` servent uniquement aux prévisualisations et aux
 * tests : la décision reste prise en base.
 */

/** Motifs de refus, traduits pour le client. */
const REJECTION_MESSAGES: Record<CouponRejectionReason, string> = {
  CODE_INCONNU: "Ce code promo n'existe pas.",
  CODE_DESACTIVE: "Ce code promo n'est plus actif.",
  CODE_NON_ENCORE_VALIDE: "Ce code promo n'est pas encore valable.",
  CODE_EXPIRE: "Ce code promo est expiré.",
  CODE_EPUISE: "Ce code promo a atteint sa limite d'utilisation.",
  CODE_LIMITE_PAR_UTILISATEUR:
    "Ce code promo a déjà été utilisé le nombre de fois autorisé pour vous.",
  MINIMUM_NON_ATTEINT: "Le montant minimum de commande n'est pas atteint pour ce code.",
  CODE_HORS_PORTEE:
    "Ce code promo ne s'applique à aucun article de votre commande.",
  REMISE_NULLE: "Ce code ne réduit pas le montant de votre commande.",
};

export interface CouponCheckResult extends CouponValidation {
  /** Message prêt à afficher au client ; `null` si le code est valide. */
  message: string | null;
}

/**
 * Ligne transmise à `coupon_is_valid` pour évaluer la portée.
 *
 * `line_total` est le montant de la ligne (prix unitaire × quantité). Seul le
 * variant est nécessaire : la catégorie est retrouvée en base via le produit.
 */
export interface CouponRpcItem {
  variant_id: string;
  line_total: number;
}

/**
 * Valide un code et calcule la remise.
 *
 * `p_subtotal` est le sous-total **recalculé par le serveur**, jamais celui
 * transmis par le navigateur.
 *
 * `phone` identifie le client pour la limite par utilisateur. Elle est optionnelle
 * pour ne pas casser les appels existants, mais la validation définitive est
 * refaite dans `create_order`, qui possède toujours le téléphone saisi.
 *
 * `items` porte les lignes du panier : sans elles, un coupon à portée
 * catégorie/produit est refusé (`CODE_HORS_PORTEE`) plutôt qu'appliqué à
 * l'ensemble du panier.
 */
export async function validateCoupon(
  rawCode: string,
  subtotal: number,
  phone?: string | null,
  items?: CouponRpcItem[] | null
): Promise<CouponCheckResult> {
  const code = normalizeCouponCode(rawCode);

  if (code === "") {
    return { valid: false, code: null, couponId: null, discount: 0, reason: null, message: null };
  }

  const payload: CouponRpcItem[] = Array.isArray(items)
    ? items.map((item) => ({
        variant_id: String(item.variant_id),
        line_total: Math.max(0, Math.floor(Number(item.line_total) || 0)),
      }))
    : [];

  const outcome = await safeQuery("coupons.validate", (client) =>
    client.rpc("coupon_is_valid", {
      p_code: code,
      p_subtotal: Math.max(0, Math.floor(subtotal)),
      p_user_key: phone ? couponUserKey(phone) : null,
      // Un panier vide reste `null` : la portée exige des lignes réelles.
      p_items: payload.length > 0 ? payload : null,
    })
  );

  const row = toSingle(outcome) as
    | {
        coupon_id: string | null;
        coupon_code: string | null;
        discount: number | string | null;
        is_valid: boolean;
        reason: string | null;
      }
    | null;

  // La fonction est indisponible : on n'accorde aucune remise. Accorder zéro
  // plutôt que de faire confiance à un calcul local.
  if (!row) {
    logger.warn("coupon: validation indisponible, remise accordée à zéro", { code });
    return {
      valid: false,
      code,
      couponId: null,
      discount: 0,
      reason: "CODE_INCONNU",
      message:
        "La validation des codes promo est momentanément indisponible. Votre commande reste valable sans remise.",
    };
  }

  const discount = typeof row.discount === "string" ? Number(row.discount) : (row.discount ?? 0);
  const reason = row.reason as CouponRejectionReason | null;

  return {
    valid: Boolean(row.is_valid),
    code: row.is_valid ? (row.coupon_code ?? code) : code,
    couponId: row.is_valid ? row.coupon_id : null,
    discount: row.is_valid ? Math.max(0, Math.floor(discount)) : 0,
    reason: row.is_valid ? null : reason,
    message: row.is_valid
      ? null
      : (REJECTION_MESSAGES[reason ?? "CODE_INCONNU"] ?? REJECTION_MESSAGES.CODE_INCONNU),
  };
}

/** Applique une remise à un sous-total sans jamais le rendre négatif. */
export { applyDiscount };

// ============================================================
// Administration
// ============================================================

/** Ligne de liste, avec les libellés de la portée résolus par PostgREST. */
export type AdminCouponRow = Coupon & {
  categories: { name: string } | null;
  products: { name: string } | null;
};

const COUPON_SELECT = `
  id, code, description, discount_type, discount_value,
  min_order_amount, max_discount_amount, starts_at, expires_at,
  max_uses, used_count, max_uses_per_user, is_active,
  applies_to_category_id, applies_to_product_id, created_at, updated_at,
  categories:applies_to_category_id(name),
  products:applies_to_product_id(name)
`;

export const COUPON_PAGE_SIZE = 25;

export interface CouponListFilters {
  search?: string;
  /** "tous" | "actifs" | "inactifs" */
  status?: string;
  /** "tous" | "percentage" | "fixed" */
  type?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Coupons, paginés, pour l'écran d'administration.
 *
 * Le statut « actifs » combine les trois conditions que le moteur applique
 * lui-même : `is_active`, fenêtre de démarrage et absence d'expiration passée.
 * Un code actif mais encore à venir n'est pas « actif » pour un client.
 */
export async function listCoupons(
  filters: CouponListFilters = {}
): Promise<{
  rows: AdminCouponRow[];
  totalCount: number;
  page: number;
  totalPages: number;
}> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(Math.max(1, Math.floor(filters.pageSize ?? COUPON_PAGE_SIZE)), 100);
  const search = (filters.search ?? "").trim();
  const nowIso = new Date().toISOString();

  const outcome = await safeQuery("coupons.list", (supabase) => {
    let builder = supabase
      .from("coupons")
      .select(COUPON_SELECT, { count: "exact" })
      .order("created_at", { ascending: false });

    if (filters.status === "actifs") {
      builder = builder
        .eq("is_active", true)
        .lte("starts_at", nowIso)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
    } else if (filters.status === "inactifs") {
      builder = builder.or(
        `is_active.eq.false,starts_at.gt.${nowIso},expires_at.lt.${nowIso}`
      );
    }

    if (filters.type === "percentage") builder = builder.eq("discount_type", "PERCENTAGE");
    if (filters.type === "fixed") builder = builder.eq("discount_type", "FIXED_AMOUNT");

    // Mot par motif, sans espace (interdit par la syntaxe `or(...)` de
    // PostgREST) : le code et sa description sont interrogés ensemble.
    const patterns = buildLikePatterns(search);
    if (patterns.length > 0) {
      builder = builder.or(
        patterns
          .flatMap((pattern) => [
            `code.ilike.${pattern}`,
            `description.ilike.${pattern}`,
          ])
          .join(",")
      );
    }

    const from = (page - 1) * pageSize;
    return builder.range(from, from + pageSize - 1);
  });

  const rows = toList(outcome) as unknown as AdminCouponRow[];
  const totalCount = outcome.count ?? rows.length;

  return {
    rows,
    totalCount,
    page,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

/** Un coupon, avec les libellés de portée, pour l'écran d'édition. */
export async function getCouponById(id: string): Promise<AdminCouponRow | null> {
  const outcome = await safeQuery("coupons.byId", (supabase) =>
    supabase.from("coupons").select(COUPON_SELECT).eq("id", id).limit(1)
  );

  return toSingle(outcome) as AdminCouponRow | null;
}

/** Usage d'un code donné, pour l'écran d'édition. */
export interface CouponUsageEntry {
  id: string;
  order_id: string | null;
  /** Identité du client (téléphone normalisé) ; `null` si inconnue. */
  user_key: string | null;
  discount: number;
  created_at: string;
}

export async function listCouponUsage(
  couponId: string
): Promise<{ entries: CouponUsageEntry[]; total: number }> {
  const outcome = await safeQuery("coupons.usage", (supabase) =>
    supabase
      .from("coupon_usages")
      .select("id, order_id, user_key, discount, created_at", { count: "exact" })
      .eq("coupon_id", couponId)
      .order("created_at", { ascending: false })
      .limit(100)
  );

  return {
    entries: toList(outcome) as unknown as CouponUsageEntry[],
    total: outcome.count ?? 0,
  };
}

/**
 * Options de portée pour le formulaire d'administration.
 *
 * Catégories et produits actifs suffisent : un coupon qui viserait une
 * catégorie supprimée n'aurait aucun effet, et l'option serait morte.
 */
export async function listCouponScopeOptions(): Promise<{
  categories: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
}> {
  const categoriesOutcome = await safeQuery("coupons.scopeCategories", (supabase) =>
    supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(300)
  );

  const productsOutcome = await safeQuery("coupons.scopeProducts", (supabase) =>
    supabase
      .from("products")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(500)
  );

  return {
    categories: toList(categoriesOutcome) as Array<{ id: string; name: string }>,
    products: toList(productsOutcome) as Array<{ id: string; name: string }>,
  };
}

/** Résumé du statut affiché dans les listes, dérivé des mêmes règles que le moteur. */
export function couponStatusLabel(coupon: Coupon): { label: string; tone: "success" | "warning" | "neutral" } {
  const now = Date.now();
  const startsAt = Date.parse(coupon.starts_at);
  const expiresAt = coupon.expires_at ? Date.parse(coupon.expires_at) : null;

  if (!coupon.is_active) return { label: "Désactivé", tone: "neutral" };
  if (Number.isFinite(startsAt) && startsAt > now) return { label: "À venir", tone: "warning" };
  if (expiresAt !== null && Number.isFinite(expiresAt) && expiresAt < now) {
    return { label: "Expiré", tone: "neutral" };
  }
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return { label: "Épuisé", tone: "warning" };
  }
  return { label: "Actif", tone: "success" };
}

/** Libellé de la portée, pour les listes et l'édition. */
export function couponScopeLabel(
  coupon: Coupon,
  scopeNames?: { categoryName?: string | null; productName?: string | null }
): string {
  if (coupon.applies_to_product_id) {
    return scopeNames?.productName ? `Produit : ${scopeNames.productName}` : "Un produit";
  }
  if (coupon.applies_to_category_id) {
    return scopeNames?.categoryName ? `Catégorie : ${scopeNames.categoryName}` : "Une catégorie";
  }
  return "Toute la boutique";
}
