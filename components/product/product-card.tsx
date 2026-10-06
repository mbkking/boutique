import Image from "next/image";
import Link from "next/link";
import { Package, Star, TrendingUp, Heart } from "lucide-react";
import { getAvailableStock } from "@/lib/services/inventory";
import { Price } from "@/components/ui/price";
import { StockBadge } from "@/components/ui/stock-badge";
import { Badge as UIBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProductWithRelations } from "@/lib/data/products";

export function primaryImageUrl(product: ProductWithRelations): string | null {
  return product.images[0]?.url ?? null;
}



function NewBadge({ is_new }: { is_new?: boolean | null }) {
  if (is_new !== true) return null;

  return (
    <UIBadge variant="info" className="text-xs">
      <Star className="size-3 mr-1" />
      Nouveau
    </UIBadge>
  );
}

function PopularBadge({ is_popular }: { is_popular?: boolean | null }) {
  if (is_popular !== true) return null;

  return (
    <UIBadge variant="warning" className="text-xs">
      <TrendingUp className="size-3 mr-1" />
      Populaire
    </UIBadge>
  );
}

export function ProductCard({ product }: { product: ProductWithRelations }) {
  const available = getAvailableStock({
    stock_on_hand: product.stock_on_hand,
    stock_reserved: product.stock_reserved,
  });
  const imageUrl = primaryImageUrl(product);
  const discount =
    product.compare_at_price && product.compare_at_price > product.price
      ? Math.round(
          ((product.compare_at_price - product.price) / product.compare_at_price) * 100
        )
      : null;

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface",
        "shadow-card transition-all duration-300",
        "hover:-translate-y-1 hover:shadow-card-hover"
      )}
    >
      <Link
        href={`/products/${product.slug}`}
        className="focus-visible:focus-ring relative block aspect-[4/5] overflow-hidden bg-surface-alt"
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={product.images[0]?.alt_text || product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-surface-alt to-surface-warm text-text-muted/40"
          >
            <Package className="size-10" />
            <span className="text-xs font-medium">ISF NAF-CHOPOP</span>
          </span>
        )}

        {/* Badges */}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {discount !== null && (
            <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-surface shadow-sm">
              {`-${discount} %`}
            </span>
          )}
          <NewBadge is_new={product.is_new} />
          <PopularBadge is_popular={product.is_popular} />
        </div>

        {/* Bouton favori (visuel uniquement) */}
        <button
          type="button"
          aria-label="Ajouter aux favoris"
          className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-surface/90 text-text-muted opacity-0 shadow-sm backdrop-blur-sm transition-all duration-200 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Heart className="size-4" />
        </button>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        {product.category && (
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-light">
            {product.category.name}
          </span>
        )}

        <Link
          href={`/products/${product.slug}`}
          className="focus-visible:focus-ring line-clamp-2 text-sm font-medium text-text transition-colors hover:text-primary"
        >
          {product.name}
        </Link>

        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          <Price amount={product.price} compareAtPrice={product.compare_at_price} size="sm" />

          <StockBadge
            available={available}
            lowStockThreshold={product.low_stock_threshold}
          />
        </div>
      </div>
    </article>
  );
}

export function ProductCardGrid({ products }: { products: ProductWithRelations[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {products.map((product) => (
        <li key={product.id} className="h-full">
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
