import type { SupabaseAdminClient } from "@/lib/supabase/server";

export interface StockInfo {
  stock_on_hand: number;
  stock_reserved: number;
}

export type MovementType = "IN" | "OUT" | "ADJUSTMENT" | "RESERVATION" | "RELEASE";

export interface StockResult {
  success: boolean;
  error?: string;
}

export function getAvailableStock(stock: StockInfo): number {
  return Math.max(0, stock.stock_on_hand - stock.stock_reserved);
}

/** Ce qu'il faut d'une variante pour agreger son stock. */
export interface VariantStockLike extends StockInfo {
  is_active: boolean;
}

/**
 * Stock total d'un produit, reconstruit depuis ses variantes actives.
 *
 * `product_variants` est la source de vérité du stock vendable : le panier,
 * la commande et les ajustements n'y écrivent que là. `products.stock_on_hand`
 * n'en est qu'un agrégat, maintenu par le trigger `trg_sync_product_stock`.
 *
 * Cette fonction recalcule le même agrégat côté lecture. Elle sert de
 * référence de test à la migration et garantit la cohérence des écrans même
 * quand l'agrégat SQL n'a pas encore été recalculé.
 *
 * Une variante inactive est exclue : ses unités ne sont pas vendables, et la
 * bascule `is_active` doit déplacer le total de part et d'autre.
 */
export function aggregateActiveVariantStock(variants: VariantStockLike[]): StockInfo {
  let stockOnHand = 0;
  let stockReserved = 0;

  for (const variant of variants) {
    if (!variant.is_active) continue;
    stockOnHand += variant.stock_on_hand;
    stockReserved += variant.stock_reserved;
  }

  return { stock_on_hand: stockOnHand, stock_reserved: stockReserved };
}

/**
 * Stock vendable d'un produit, dérivé de ses variantes.
 *
 * Un produit sans variante ne peut pas être vendu : le panier et la commande
 * exigent une `variant_id`. Son stock vaut donc 0 et il s'affiche en rupture,
 * plutôt que d'annoncer un stock inaccessible.
 *
 * C'est la fonction à utiliser pour toute lecture d'affichage. `products` n'est
 * plus passé en paramètre : la valeur agrégée qu'il contient ne doit jamais
 * servir à alimenter un écran.
 */
export function getProductStock(variants: VariantStockLike[]): StockInfo {
  if (variants.length === 0) return { stock_on_hand: 0, stock_reserved: 0 };
  return aggregateActiveVariantStock(variants);
}

export function isStockSufficient(
  stock: StockInfo,
  requestedQuantity: number
): boolean {
  return getAvailableStock(stock) >= requestedQuantity;
}

async function readStock(
  supabase: SupabaseAdminClient,
  variantId: string
): Promise<StockInfo | null> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("stock_on_hand, stock_reserved")
    .eq("id", variantId)
    .maybeSingle();

  if (error) return null;
  return data as StockInfo | null;
}

async function recordMovement(
  supabase: SupabaseAdminClient,
  params: {
    variantId: string;
    type: MovementType;
    quantity: number;
    reason: string;
    referenceId?: string | null;
    actorId?: string | null;
  }
): Promise<void> {
  await supabase.from("inventory_movements").insert({
    variant_id: params.variantId,
    type: params.type,
    quantity: params.quantity,
    reason: params.reason,
    reference_id: params.referenceId ?? null,
    created_by: params.actorId ?? null,
  });
}

/**
 * Réserve du stock pour une commande (sans décrémenter le stock physique).
 * Refuse si le stock disponible est insuffisant (RM-02).
 */
export async function reserveStock(
  supabase: SupabaseAdminClient,
  variantId: string,
  quantity: number,
  orderId?: string | null,
  actorId?: string | null
): Promise<StockResult> {
  const stock = await readStock(supabase, variantId);
  if (!stock) return { success: false, error: "Variante introuvable" };
  if (!isStockSufficient(stock, quantity)) {
    return {
      success: false,
      error: `Stock insuffisant : ${getAvailableStock(stock)} disponible(s) pour ${quantity} demandé(s)`,
    };
  }

  const { error } = await supabase
    .from("product_variants")
    .update({ stock_reserved: stock.stock_reserved + quantity })
    .eq("id", variantId);

  if (error) return { success: false, error: error.message };

  await recordMovement(supabase, {
    variantId,
    type: "RESERVATION",
    quantity,
    reason: "Réservation pour commande",
    referenceId: orderId ?? null,
    actorId,
  });
  return { success: true };
}

/** Libère une réservation (annulation, échec). */
export async function releaseStock(
  supabase: SupabaseAdminClient,
  variantId: string,
  quantity: number,
  orderId?: string | null,
  actorId?: string | null
): Promise<StockResult> {
  const stock = await readStock(supabase, variantId);
  if (!stock) return { success: false, error: "Variante introuvable" };

  const { error } = await supabase
    .from("product_variants")
    .update({ stock_reserved: Math.max(0, stock.stock_reserved - quantity) })
    .eq("id", variantId);

  if (error) return { success: false, error: error.message };

  await recordMovement(supabase, {
    variantId,
    type: "RELEASE",
    quantity,
    reason: "Libération de réservation",
    referenceId: orderId ?? null,
    actorId,
  });
  return { success: true };
}

/** Décrémente le stock physique et la réservation (RM-06). */
export async function decrementStock(
  supabase: SupabaseAdminClient,
  variantId: string,
  quantity: number,
  orderId?: string | null,
  actorId?: string | null
): Promise<StockResult> {
  const stock = await readStock(supabase, variantId);
  if (!stock) return { success: false, error: "Variante introuvable" };
  if (stock.stock_on_hand < quantity) {
    return { success: false, error: "Stock physique insuffisant" };
  }

  const { error } = await supabase
    .from("product_variants")
    .update({
      stock_on_hand: stock.stock_on_hand - quantity,
      stock_reserved: Math.max(0, stock.stock_reserved - quantity),
    })
    .eq("id", variantId);

  if (error) return { success: false, error: error.message };

  await recordMovement(supabase, {
    variantId,
    type: "OUT",
    quantity,
    reason: "Sortie pour livraison",
    referenceId: orderId ?? null,
    actorId,
  });
  return { success: true };
}

/** Ajustement manuel avec motif (obligation du cahier des charges §13). */
export async function adjustStock(
  supabase: SupabaseAdminClient,
  variantId: string,
  newQuantity: number,
  reason: string,
  actorId?: string | null
): Promise<StockResult> {
  if (newQuantity < 0) return { success: false, error: "Le stock ne peut pas être négatif" };

  const stock = await readStock(supabase, variantId);
  if (!stock) return { success: false, error: "Variante introuvable" };

  const delta = newQuantity - stock.stock_on_hand;

  const { error } = await supabase
    .from("product_variants")
    .update({ stock_on_hand: newQuantity })
    .eq("id", variantId);

  if (error) return { success: false, error: error.message };

  await recordMovement(supabase, {
    variantId,
    type: delta >= 0 ? "IN" : "ADJUSTMENT",
    quantity: delta,
    reason,
    actorId,
  });
  return { success: true };
}

export async function incrementStock(
  supabase: SupabaseAdminClient,
  variantId: string,
  quantity: number,
  reason = "Entrée de stock",
  actorId?: string | null
): Promise<StockResult> {
  const stock = await readStock(supabase, variantId);
  if (!stock) return { success: false, error: "Variante introuvable" };

  const { error } = await supabase
    .from("product_variants")
    .update({ stock_on_hand: stock.stock_on_hand + quantity })
    .eq("id", variantId);

  if (error) return { success: false, error: error.message };

  await recordMovement(supabase, {
    variantId,
    type: "IN",
    quantity,
    reason,
    actorId,
  });
  return { success: true };
}
