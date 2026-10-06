import { Check, Clock, PackageX, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Nombre d'exemplaires en dessous duquel le stock est considéré faible. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 3;

export type StockLevel = "available" | "low" | "out" | "preorder";

export interface StockBadgeProps {
  /** Stock disponible (stock physique moins stock réservé). */
  available: number;
  lowStockThreshold?: number;
  /** Affiche « Précommande » au lieu du niveau de stock réel. */
  isPreorder?: boolean;
  className?: string;
}

function resolveStockLevel(
  available: number,
  lowStockThreshold: number,
  isPreorder: boolean
): StockLevel {
  if (isPreorder) return "preorder";
  if (!Number.isFinite(available) || available <= 0) return "out";
  if (available <= lowStockThreshold) return "low";
  return "available";
}

/**
 * Indique la disponibilité d'un produit.
 *
 * Règle d'accessibilité (§33) : le statut est toujours doublé d'un libellé
 * textuel et d'une icône — jamais de la couleur seule.
 */
export function StockBadge({
  available,
  lowStockThreshold = DEFAULT_LOW_STOCK_THRESHOLD,
  isPreorder = false,
  className,
}: StockBadgeProps) {
  const level = resolveStockLevel(available, lowStockThreshold, isPreorder);

  switch (level) {
    case "preorder":
      return (
        <Badge variant="info" icon={<Clock className="size-3.5" />} className={className}>
          Précommande
        </Badge>
      );
    case "out":
      return (
        <Badge variant="danger" icon={<PackageX className="size-3.5" />} className={className}>
          Rupture de stock
        </Badge>
      );
    case "low":
      return (
        <Badge
          variant="warning"
          icon={<TriangleAlert className="size-3.5" />}
          className={className}
        >
          Stock faible
          <span className="sr-only">
            {` — ${available} exemplaire${available > 1 ? "s" : ""} restant${
              available > 1 ? "s" : ""
            }`}
          </span>
        </Badge>
      );
    case "available":
      return (
        <Badge variant="success" icon={<Check className="size-3.5" />} className={className}>
          En stock
        </Badge>
      );
  }
}