"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Price } from "@/components/ui/price";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { StockBadge } from "@/components/ui/stock-badge";
import { formatPrice } from "@/lib/services/pricing";
import { useCart } from "@/components/cart/cart-provider";

export interface PurchaseVariant {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  price: number;
  compareAtPrice: number | null;
  availableStock: number;
}

export interface PurchasePanelProps {
  productId: string;
  productName: string;
  slug: string;
  availableStock: number;
  lowStockThreshold: number;
  variants: PurchaseVariant[];
  imageUrl: string | null;
}

function variantLabel(variant: PurchaseVariant): string {
  const entries = Object.entries(variant.attributes ?? {});
  if (entries.length === 0) return "Modèle standard";
  return entries.map(([key, value]) => `${key} : ${value}`).join(" — ");
}

/**
 * Bloc d'achat interactif d'une fiche produit.
 *
 * Le stock affiché vient du serveur à chaque rendu de page ; la quantité est
 * bornée par le stock disponible de la variante choisie. Le panier lui-même est
 * géré par le contexte global (stockage local), et l'action serveur
 * `addToCartAction` sert de garde-fou côté base.
 */
export function PurchasePanel({
  productId,
  productName,
  slug,
  availableStock,
  lowStockThreshold,
  variants,
  imageUrl,
}: PurchasePanelProps) {
  const router = useRouter();
  const { addItem } = useCart();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

/**
   * Variantes proposées à la sélection : celles qui sont en stock.
   * Si aucune ne l'est, on retombe sur la liste complète — un sélecteur vide
   * donnerait au visiteur l'impression que la page est cassée. Les options
   * restent marquées indisponibles et l'ajout au panier est refusé.
   */
  const selectableVariants = useMemo(() => {
    const inStock = variants.filter((variant) => variant.availableStock > 0);
    return inStock.length > 0 ? inStock : variants;
  }, [variants]);

  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    selectableVariants[0]?.id ?? ""
  );
  const [quantity, setQuantity] = useState(1);

  const selectedVariant =
    variants.find((variant) => variant.id === selectedVariantId) ?? variants[0] ?? null;

  // Le stock utile est celui de la variante ; sans variante, celui du produit.
  const maxStock = selectedVariant ? selectedVariant.availableStock : availableStock;
  const effectiveMax = Math.max(0, maxStock);
  const clampedQuantity = Math.min(Math.max(quantity, 1), Math.max(effectiveMax, 1));
  const isOutOfStock = effectiveMax <= 0;

  function handleAddToCart() {
    setError(null);
    setFeedback(null);

    if (!selectedVariant) {
      setError("Ce produit n'est pas disponible à la vente pour le moment.");
      return;
    }

    if (isOutOfStock) {
      setError(`« ${productName} » est en rupture de stock.`);
      return;
    }

    addItem({
      variant_id: selectedVariant.id,
      product_id: productId,
      name: productName,
      slug,
      variant_label: variantLabel(selectedVariant),
      unit_price: selectedVariant.price,
      quantity: clampedQuantity,
      image_url: imageUrl,
      max_stock: effectiveMax,
    });

    setFeedback(`« ${productName} » a été ajouté à votre panier.`);

    // On rafraîchit pour récupérer le stock à jour après ajout.
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StockBadge
            available={effectiveMax}
            lowStockThreshold={lowStockThreshold}
          />
          {selectedVariant ? (
            <span className="text-xs text-text-muted">
              Réf. {selectedVariant.sku}
            </span>
          ) : null}
        </div>

        {variants.length > 1 ? (
          <Select
            label="Choisissez une variante"
            name="variant"
            value={selectedVariantId}
            onChange={(event) => {
              setSelectedVariantId(event.target.value);
              setQuantity(1);
              setFeedback(null);
              setError(null);
            }}
          >
            {selectableVariants.map((variant) => (
              <option key={variant.id} value={variant.id} disabled={variant.availableStock <= 0}>
                {`${variantLabel(variant)}${
                  variant.availableStock > 0
                    ? ` — ${formatPrice(variant.price)}`
                    : " — épuisé"
                }`}
              </option>
            ))}
          </Select>
        ) : selectedVariant ? (
          <p className="text-sm text-text-muted">{variantLabel(selectedVariant)}</p>
        ) : null}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text">Quantité</span>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="md"
              aria-label="Diminuer la quantité"
              disabled={isOutOfStock || clampedQuantity <= 1 || isPending}
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
            >
              <Minus aria-hidden="true" className="size-4" />
            </Button>

            <span
              aria-live="polite"
              className="min-w-12 text-center text-base font-semibold text-text"
            >
              <span className="sr-only">Quantité sélectionnée : </span>
              {clampedQuantity}
            </span>

            <Button
              variant="outline"
              size="md"
              aria-label="Augmenter la quantité"
              disabled={isOutOfStock || clampedQuantity >= effectiveMax || isPending}
              onClick={() => setQuantity((current) => Math.min(effectiveMax, current + 1))}
            >
              <Plus aria-hidden="true" className="size-4" />
            </Button>

            {isPending ? <Spinner size="sm" label="Mise à jour du stock" /> : null}
          </div>

          {effectiveMax > 0 && effectiveMax <= lowStockThreshold ? (
            <p className="text-xs text-warning">
              {`Il ne reste que ${effectiveMax} exemplaire${
                effectiveMax > 1 ? "s" : ""
              } en stock.`}
            </p>
          ) : null}
        </div>

        {selectedVariant ? (
          <div className="flex flex-col gap-1 border-t border-border pt-4">
            <span className="text-sm text-text-muted">Total pour cette quantité</span>
            <Price amount={selectedVariant.price * clampedQuantity} size="lg" />
          </div>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={isOutOfStock || !selectedVariant || isPending}
          onClick={handleAddToCart}
        >
          <ShoppingCart aria-hidden="true" className="size-4" />
          {isOutOfStock ? "Rupture de stock" : "Ajouter au panier"}
        </Button>

        {/* Annonces d'ajout et d'erreur, dans une région live. */}
        <div role="status" aria-live="polite" className="min-h-5 text-sm">
          {feedback ? (
            <p className="flex items-center gap-2 font-medium text-success">
              <Check aria-hidden="true" className="size-4" />
              {feedback}
            </p>
          ) : null}
          {error ? <p className="font-medium text-danger">{error}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}