/**
 * Logique pure des codes promo.
 *
 * Volontairement sans dépendance serveur : ces fonctions sont appelées par le
 * service (qui interroge la base) comme par les tests, et la validation d'une
 * remise ne doit dépendre d'aucun état de session.
 */

import type { CouponDiscountType } from "@/types";

/** Normalise une saisie : majuscules, sans espaces superflus. */
export function normalizeCouponCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .slice(0, 24);
}

/** Applique une remise à un sous-total sans jamais le rendre négatif. */
export function applyDiscount(subtotal: number, discount: number): number {
  const safeSubtotal = Math.max(0, Math.floor(subtotal));
  const safeDiscount = Math.max(0, Math.floor(discount));
  return Math.max(0, safeSubtotal - Math.min(safeDiscount, safeSubtotal));
}

/**
 * Identité client normalisée pour le comptage des coupons.
 *
 * Reflet exact de `public.coupon_user_key(text)` : les deux doivent produire la
 * même chaîne, sinon un client verrait son usage compté deux fois sous deux
 * identifiants et pourrait contourner sa propre limite.
 *
 * Le préfixe `tel:` distingue un téléphone d'un identifiant de compte, le cas
 * échéant.
 */
export function couponUserKey(phone: string | null | undefined): string | null {
  if (typeof phone !== "string") return null;

  const trimmed = phone.trim();
  if (trimmed === "") return null;

  const withPrefix = trimmed.startsWith("+")
    ? trimmed
    : trimmed.startsWith("00")
      ? `+${trimmed.slice(2)}`
      : `+227${trimmed}`;

  const digits = withPrefix.replace(/[^0-9+]/g, "");
  return digits === "" ? null : `tel:${digits}`;
}

// ============================================================
// Portée : catégorie / produit / toute la boutique
// ============================================================

/** Cible d'un coupon. `all` = panier entier. */
export type CouponScopeType = "all" | "category" | "product";

export interface CouponScope {
  type: CouponScopeType;
  categoryId: string | null;
  productId: string | null;
}

/** Ligne de panier suffisante pour évaluer la portée. */
export interface CouponEligibleLine {
  productId: string;
  /** `null` si le produit n'appartient à aucune catégorie. */
  categoryId: string | null;
  /** Montant de la ligne (prix unitaire × quantité), en XOF. */
  lineTotal: number;
}

/** Règles d'un coupon, indépendantes de sa portée. */
export interface CouponDiscountRules {
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
}

/**
 * Reconstruit la portée à partir des deux colonnes de la table `coupons`.
 *
 * Une seule colonne renseignée est attendue (contrainte `coupons_scope_check`) ;
 * si les deux le sont, c'est le produit qui prime, comme dans le moteur SQL.
 */
export function couponScopeFromColumns(
  categoryId: string | null | undefined,
  productId: string | null | undefined
): CouponScope {
  if (productId) return { type: "product", productId, categoryId: null };
  if (categoryId) return { type: "category", categoryId, productId: null };
  return { type: "all", categoryId: null, productId: null };
}

/** Une ligne appartient-elle au périmètre d'un coupon ? */
export function isCouponLineEligible(
  scope: CouponScope,
  line: CouponEligibleLine
): boolean {
  if (scope.type === "product") {
    return scope.productId !== null && line.productId === scope.productId;
  }
  if (scope.type === "category") {
    return (
      scope.categoryId !== null &&
      line.categoryId !== null &&
      line.categoryId === scope.categoryId
    );
  }
  return true;
}

/**
 * Montant sur lequel un coupon peut agir.
 *
 * Miroir exact du calcul SQL de `coupon_is_valid` : pour un coupon à portée,
 * seules les lignes éligibles comptent ; un panier sans article éligible donne
 * 0 (refus `CODE_HORS_PORTEE`). Pour un coupon global, c'est le sous-total.
 */
export function couponEligibleSubtotal(
  scope: CouponScope,
  lines: readonly CouponEligibleLine[]
): number {
  const total = lines.reduce((sum, line) => {
    const amount = Number.isFinite(line.lineTotal) ? Math.floor(line.lineTotal) : 0;
    return sum + Math.max(0, amount);
  }, 0);

  if (scope.type === "all") return total;

  return lines.reduce((sum, line) => {
    if (!isCouponLineEligible(scope, line)) return sum;
    const amount = Number.isFinite(line.lineTotal) ? Math.floor(line.lineTotal) : 0;
    return sum + Math.max(0, amount);
  }, 0);
}

/**
 * Applique les règles de remise à un montant éligible.
 *
 * Miroir documenté du moteur SQL — les mêmes bornes, dans le même ordre :
 * pourcentage du montant éligible ou montant fixe, plafond `max_discount_amount`,
 * jamais plus que le montant éligible, jamais plus que le sous-total, jamais
 * négatif. Retourne 0 si la remise est nulle (refus `REMISE_NULLE`).
 *
 * Ce calcul sert aux **prévisualisations uniquement** : la décision
 * définitive reste prise par `coupon_is_valid` en base.
 */
export function computeCouponDiscount(
  rules: CouponDiscountRules,
  eligibleAmount: number,
  orderSubtotal: number
): number {
  const eligible = Math.max(0, Math.floor(eligibleAmount));
  const subtotal = Math.max(0, Math.floor(orderSubtotal));
  if (eligible <= 0) return 0;

  const value = Math.max(0, Math.floor(rules.discountValue));

  let discount =
    rules.discountType === "PERCENTAGE"
      ? (eligible * Math.min(value, 100)) / 100
      : value;

  discount = Math.floor(discount);

  if (rules.maxDiscountAmount != null) {
    discount = Math.min(discount, Math.max(0, Math.floor(rules.maxDiscountAmount)));
  }

  discount = Math.min(discount, eligible, subtotal);
  return discount > 0 ? discount : 0;
}