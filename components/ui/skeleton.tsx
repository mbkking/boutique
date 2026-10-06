import { cn } from "@/lib/utils";

export interface SkeletonProps {
  className?: string;
}

/**
 * Espace réservé pulsé utilisé pendant le chargement du contenu.
 * Purement décoratif : masqué aux lecteurs d'écran.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="skeleton"
      className={cn("animate-pulse rounded-md bg-surface-alt", className)}
    />
  );
}