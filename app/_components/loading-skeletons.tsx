import { Skeleton } from "@/components/ui/skeleton";

/**
 * États de chargement des pages publiques.
 * Chaque route charge ses propres données côté serveur : ces squelettes
 * occupent la place du contenu pour éviter tout décalage de mise en page.
 */

export function PageHeaderSkeleton({ lines = 1 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className="h-8 w-2/3 max-w-md" />
      ))}
      <Skeleton className="h-4 w-1/3 max-w-xs" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      aria-busy="true"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-64 w-full" />
      ))}
    </div>
  );
}

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-20 w-full" />
      ))}
    </div>
  );
}