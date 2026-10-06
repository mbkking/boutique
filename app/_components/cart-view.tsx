"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Minus, Package, Plus, RefreshCw, ShoppingCart, Trash, WifiOff, ArrowRight } from "lucide-react";
import { useCart, type CartLine } from "@/components/cart/cart-provider";
import { reconcileCartAction } from "@/lib/actions/cart-reconcile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Price } from "@/components/ui/price";
import { Skeleton } from "@/components/ui/skeleton";
import { StockBadge } from "@/components/ui/stock-badge";
import { formatPrice } from "@/lib/services/pricing";

interface LineIssue {
  message: string;
  kind: "removed" | "stock" | "price";
}

function CartRow({
  line,
  issue,
  onDecreaseToStock,
}: {
  line: CartLine;
  issue?: LineIssue;
  onDecreaseToStock?: () => void;
}) {
  const { updateQuantity, removeItem } = useCart();
  const lineTotal = line.unit_price * line.quantity;
  const effectiveMax = issue?.kind === "stock" ? Math.min(line.max_stock, line.quantity) : line.max_stock;
  const atMaxStock = line.quantity >= effectiveMax;

  return (
    <li className="flex flex-col gap-4 border-b border-border py-5 last:border-b-0 sm:flex-row sm:items-center">
      <Link
        href={`/products/${line.slug}`}
        className="focus-visible:focus-ring relative size-24 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-alt"
      >
        {line.image_url ? (
          <Image
            src={line.image_url}
            alt={line.name}
            fill
            sizes="96px"
            className="object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-full items-center justify-center text-text-muted"
          >
            <Package className="size-6" />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={`/products/${line.slug}`}
          className="text-sm font-medium text-text hover:text-primary focus-visible:focus-ring"
        >
          {line.name}
        </Link>
        {line.variant_label ? (
          <p className="text-xs text-text-muted">{line.variant_label}</p>
        ) : null}
        <Price amount={line.unit_price} size="sm" />
        <div className="mt-1 flex items-center gap-2">
          <StockBadge available={effectiveMax} lowStockThreshold={3} />
          {atMaxStock ? (
            <span className="text-xs text-warning">
              {`Stock maximum atteint (${effectiveMax})`}
            </span>
          ) : null}
        </div>

        {issue ? (
          <p className="mt-1 text-xs text-warning">{issue.message}</p>
        ) : null}

        {issue?.kind === "stock" && onDecreaseToStock ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onDecreaseToStock}
            className="mt-1 h-7 w-fit"
          >
            Ajuster à la quantité disponible
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            aria-label={`Diminuer la quantité de ${line.name}`}
            disabled={line.quantity <= 1}
            onClick={() => updateQuantity(line.variant_id, line.quantity - 1)}
          >
            <Minus aria-hidden="true" className="size-4" />
          </Button>

          <span
            aria-live="polite"
            className="min-w-10 text-center text-sm font-semibold text-text"
          >
            <span className="sr-only">{`Quantité de ${line.name} : `}</span>
            {line.quantity}
          </span>

          <Button
            variant="outline"
            size="sm"
            aria-label={`Augmenter la quantité de ${line.name}`}
            disabled={atMaxStock}
            onClick={() => updateQuantity(line.variant_id, line.quantity + 1)}
          >
            <Plus aria-hidden="true" className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-text">{formatPrice(lineTotal)}</span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Retirer ${line.name} du panier`}
            onClick={() => removeItem(line.variant_id)}
          >
            <Trash aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
    </li>
  );
}

export function CartView() {
  const { lines, subtotal, totalItems, clear, isHydrated, updateQuantity, removeItem } =
    useCart();

  const [issues, setIssues] = useState<Map<string, LineIssue>>(new Map());
  const [isChecking, setIsChecking] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [checkVersion, setCheckVersion] = useState(0);

  const cartSignature = lines
    .map((line) => `${line.variant_id}:${line.quantity}:${line.unit_price}`)
    .join("|");

  const reconciliationPayload = useMemo(
    () =>
      lines.map((line) => ({
        variant_id: line.variant_id,
        quantity: line.quantity,
        client_price: line.unit_price,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartSignature]
  );

  const isCartEmpty = lines.length === 0;

  useEffect(() => {
    if (!isHydrated || isCartEmpty) return;

    let cancelled = false;

    void (async () => {
      const result = await reconcileCartAction({
        items: reconciliationPayload,
      });

      if (cancelled) return;

      setIsChecking(false);

      if (!result.success) {
        setIsOffline(true);
        return;
      }

      setIsOffline(false);

      const next = new Map<string, LineIssue>();
      for (const line of result.lines) {
        if (!line.message) continue;
        next.set(line.variantId, {
          message: line.message,
          kind: line.removed ? "removed" : line.quantityUnavailable ? "stock" : "price",
        });
      }
      setIssues(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [isHydrated, checkVersion, isCartEmpty, reconciliationPayload]);

  function requestRecheck() {
    setIsChecking(true);
    setCheckVersion((current) => current + 1);
  }

  if (!isHydrated) {
    return (
      <div aria-busy="true" className="flex flex-col gap-8">
        <Skeleton className="h-8 w-48" />
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1">
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="lg:w-80">
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">Mon panier</h1>
        <EmptyState
          icon={<ShoppingCart aria-hidden="true" className="size-6" />}
          title="Votre panier est vide"
          description="Parcourez nos catégories pour ajouter les produits qui vous intéressent."
          actionLabel="Voir le catalogue"
          actionHref="/categories"
        />
      </div>
    );
  }

  const issueList = [...issues.entries()];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">
          {`Mon panier (${totalItems} article${totalItems > 1 ? "s" : ""})`}
        </h1>
        <Button variant="ghost" size="md" onClick={clear}>
          <Trash aria-hidden="true" className="size-4" />
          Vider le panier
        </Button>
      </div>

      {isOffline ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-warning bg-warning/5 p-4 text-sm text-text"
        >
          <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Connexion indisponible : votre panier reste enregistré sur cet appareil.
            Les prix et disponibilités seront revérifiés à la commande.
          </span>
        </div>
      ) : null}

      {issueList.length > 0 ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-warning bg-warning/5 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-text">
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-warning" />
            {issueList.length === 1
              ? "Un article a changé depuis son ajout"
              : `${issueList.length} articles ont changé depuis leur ajout`}
          </p>

          <ul className="flex flex-col gap-2 text-sm text-text-muted">
            {issueList.map(([variantId, issue]) => {
              const line = lines.find((entry) => entry.variant_id === variantId);
              const prefix = line ? `${line.name} : ` : "";
              return (
                <li key={variantId} className="flex flex-wrap items-center gap-2">
                  <span>
                    {prefix}
                    {issue.message}
                  </span>
                  {issue.kind !== "removed" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(variantId)}
                      className="h-7"
                    >
                      Retirer
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={requestRecheck}
            isLoading={isChecking}
            loadingLabel="Vérification"
            disabled={isChecking}
            className="w-fit"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Revérifier
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Articles sélectionnés</CardTitle>
          </CardHeader>
          <CardContent>
            <ul>
              {lines.map((line) => (
                <CartRow
                  key={line.variant_id}
                  line={line}
                  issue={issues.get(line.variant_id)}
                  onDecreaseToStock={
                    issues.get(line.variant_id)?.kind === "stock"
                      ? () => {
                          const available = line.max_stock;
                          if (available > 0) updateQuantity(line.variant_id, available);
                          else removeItem(line.variant_id);
                        }
                      : undefined
                  }
                />
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="w-full lg:sticky lg:top-20 lg:w-80">
          <CardHeader>
            <CardTitle>Récapitulatif</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-text-muted">Sous-total</span>
              <span className="font-semibold text-text">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-text-muted">Livraison</span>
              <span className="text-text-muted">Calculée à l&apos;étape suivante</span>
            </div>
            <p className="rounded-lg bg-surface-alt p-3 text-xs text-text-muted">
              Les frais de livraison dépendent de votre quartier à Niamey. Ils seront
              confirmés avant la validation de votre commande.
            </p>
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="font-semibold text-text">Total estimé</span>
              <span className="text-lg font-bold text-text">{formatPrice(subtotal)}</span>
            </div>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <Link href="/checkout">
              <Button variant="primary" size="lg" className="w-full">
                Commander
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </Link>
            <Link href="/categories" className="text-center text-sm text-primary hover:underline">
              Continuer mes achats
            </Link>
            <p className="text-center text-xs text-text-muted">
              Ajouter au panier ne réserve pas les articles : le stock est validé au
              moment de la commande.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
