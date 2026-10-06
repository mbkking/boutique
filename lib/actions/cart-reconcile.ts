"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAvailableStock } from "@/lib/services/inventory";
import { safeQuery, toList } from "@/lib/data/safe";
import { ActionResult, failure, success } from "@/lib/actions/types";

const reconcileSchema = z.object({
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
        /**
         * Prix affiché dans le panier local. Il ne sert qu'à *détecter* un
         * écart : le prix retenu est toujours celui lu en base.
         */
        client_price: z.number().int().min(0).optional(),
      })
    )
    .max(99),
});

export interface ReconciledLine {
  variantId: string;
  /** Le produit existe encore et reste en vente. */
  available: boolean;
  /** Nom courant, susceptible d'avoir changé depuis l'ajout au panier. */
  name: string | null;
  /** Prix courant en base, seule source de vérité. */
  unitPrice: number | null;
  /** Stock réellement disponible maintenant. */
  availableStock: number;
  /** La quantité demandée dépasse le stock disponible. */
  quantityUnavailable: boolean;
  /** La quantité demandée a été ramenée au maximum disponible. */
  adjustedQuantity: number | null;
  /** Le prix a changé depuis l'ajout au panier. */
  priceChanged: boolean;
  /** Le produit a été désactivé ou retiré du catalogue. */
  removed: boolean;
  /** Message prêt à afficher au client. */
  message: string | null;
}

const RECONCILE_SELECT = `
  id,
  price,
  stock_on_hand,
  stock_reserved,
  is_active,
  products:products(id, name, slug, is_active)
`;

interface ReconcileRow {
  id: string;
  price: number;
  stock_on_hand: number;
  stock_reserved: number;
  is_active: boolean;
  products: { id: string; name: string; slug: string; is_active: boolean } | null;
}

/**
 * Réconcilie le panier local avec l'état réel du catalogue.
 *
 * Le panier vit dans `localStorage` : il n'est **jamais** une réservation
 * serveur. Entre l'ajout au panier et la validation, un prix peut changer, un
 * stock peut être vendu à quelqu'un d'autre, un produit peut être désactivé.
 * Cette action compare le panier local à la base et signale précisément ce qui
 * a bougé — elle ne modifie rien : c'est le client qui décide.
 *
 * Elle ne crée pas de commande et ne réserve aucun stock.
 */
export async function reconcileCartAction(payload: unknown): Promise<
  ActionResult<{ lines: ReconciledLine[]; hasBlockingIssue: boolean }>
> {
  const parsed = reconcileSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("Le contenu du panier est invalide.");
  }

  if (parsed.data.items.length === 0) {
    return success({ lines: [], hasBlockingIssue: false });
  }

  // On regroupe les quantités par variante : le panier peut contenir deux fois
  // la même variante après deux ajouts successifs.
  const quantities = new Map<string, number>();
  const localPrices = new Map<string, number | undefined>();
  for (const item of parsed.data.items) {
    quantities.set(item.variant_id, (quantities.get(item.variant_id) ?? 0) + item.quantity);
    localPrices.set(item.variant_id, item.client_price);
  }

  const variantIds = [...quantities.keys()];

  const outcome = await safeQuery("cart.reconcile", (client) =>
    client
      .from("product_variants")
      .select(RECONCILE_SELECT)
      .in("id", variantIds)
  );

  const rows = toList(outcome) as unknown as ReconcileRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));

  const lines: ReconciledLine[] = [];
  let hasBlockingIssue = false;

  for (const [variantId, requestedQuantity] of quantities) {
    const row = byId.get(variantId);
    const product = row?.products ?? null;
    const localPrice = localPrices.get(variantId);

    // Variante supprimée ou produit retiré du catalogue.
    if (!row || !product || !row.is_active || !product.is_active) {
      hasBlockingIssue = true;
      lines.push({
        variantId,
        available: false,
        name: product?.name ?? null,
        unitPrice: null,
        availableStock: 0,
        quantityUnavailable: false,
        adjustedQuantity: null,
        priceChanged: false,
        removed: true,
        message: "Cet article n'est plus disponible et a été retiré de votre panier.",
      });
      continue;
    }

    const availableStock = getAvailableStock({
      stock_on_hand: row.stock_on_hand,
      stock_reserved: row.stock_reserved,
    });

    const quantityUnavailable = requestedQuantity > availableStock;

    if (quantityUnavailable) {
      hasBlockingIssue = true;
    }

    lines.push({
      variantId,
      available: true,
      name: product.name,
      unitPrice: row.price,
      availableStock,
      quantityUnavailable,
      // Une quantité nulle signifie qu'il faut retirer la ligne.
      adjustedQuantity: quantityUnavailable ? Math.min(requestedQuantity, availableStock) : null,
      priceChanged: typeof localPrice === "number" && localPrice !== row.price,
      removed: false,
      message: buildMessage({
        quantityUnavailable,
        availableStock,
        priceChanged: typeof localPrice === "number" && localPrice !== row.price,
        currentPrice: row.price,
        localPrice,
      }),
    });
  }

  return success({ lines, hasBlockingIssue });
}

/**
 * Applique une correction de quantité au panier local.
 *
 * Le panier reste côté client ; cette action se contente de invalider les
 * caches serveur pour que la page panier et le checkout repartent du même état.
 */
export async function acknowledgeCartChangeAction(): Promise<
  ActionResult<Record<never, never>>
> {
  revalidatePath("/cart");
  return success({});
}
/** Compose le message client, en donnant priorité au problème le plus bloquant. */
function buildMessage(input: {
  quantityUnavailable: boolean;
  availableStock: number;
  priceChanged: boolean;
  currentPrice: number;
  localPrice: number | undefined;
}): string | null {
  if (input.quantityUnavailable) {
    return input.availableStock === 0
      ? "Cet article vient d'être épuisé."
      : `Il ne reste que ${input.availableStock} unité${
          input.availableStock > 1 ? "s" : ""
        } de cet article.`;
  }

  if (input.priceChanged && typeof input.localPrice === "number") {
    return input.currentPrice > input.localPrice
      ? `Le prix de cet article vient de passer à ${input.currentPrice.toLocaleString(
          "fr-FR"
        )} XOF.`
      : `Le prix de cet article a été réduit à ${input.currentPrice.toLocaleString(
          "fr-FR"
        )} XOF.`;
  }

  return null;
}