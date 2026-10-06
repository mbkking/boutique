import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/services/pricing";

const SIZE_CLASSES = {
  sm: {
    current: "text-sm",
    compare: "text-xs",
  },
  md: {
    current: "text-base",
    compare: "text-sm",
  },
  lg: {
    current: "text-xl",
    compare: "text-base",
  },
} as const;

export type PriceSize = keyof typeof SIZE_CLASSES;

export interface PriceProps {
  /** Montant en FCFA (entier, sans décimales). */
  amount: number;
  /** Ancien prix barré, affiché uniquement s'il est supérieur à `amount`. */
  compareAtPrice?: number | null;
  size?: PriceSize;
  className?: string;
}

/**
 * Affiche un montant en FCFA via `formatPrice`.
 * Les montants sont des entiers : aucun centime n'est affiché.
 */
export function Price({
  amount,
  compareAtPrice,
  size = "md",
  className,
}: PriceProps) {
  const showCompareAt =
    typeof compareAtPrice === "number" &&
    Number.isFinite(compareAtPrice) &&
    compareAtPrice > amount;

  return (
    <span className={cn("flex flex-wrap items-baseline gap-2", className)}>
      <span className={cn("font-semibold text-text", SIZE_CLASSES[size].current)}>
        {formatPrice(amount)}
      </span>
      {showCompareAt ? (
        <>
          <span
            className={cn("text-text-muted line-through", SIZE_CLASSES[size].compare)}
          >
            {formatPrice(compareAtPrice)}
          </span>
          <span className="sr-only">
            {`Ancien prix : ${formatPrice(compareAtPrice)}`}
          </span>
        </>
      ) : null}
    </span>
  );
}