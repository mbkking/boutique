import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface LoadingStateProps {
  /** Message annoncé et affiché. */
  label?: string;
  /** `spinner` pour une action courte, `skeleton` pour du contenu en arrivee. */
  variant?: "spinner" | "skeleton";
  /** Nombre de plaques pour la variante `skeleton`. */
  rows?: number;
  children?: ReactNode;
  className?: string;
}

/**
 * État de chargement.
 *
 * Regroupe le message et l'indicateur : ces deux éléments vont toujours
 * ensemble, et le message doit être présent même quand la zone est purement
 * décorative — sans lui, l'utilisateur entend un « chargement » sans savoir ce
 * qui charge.
 */
export function LoadingState({
  label = "Chargement en cours",
  variant = "spinner",
  rows = 3,
  children,
  className,
}: LoadingStateProps) {
  if (variant === "skeleton") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn("flex flex-col gap-3", className)}
      >
        <span className="sr-only">{label}</span>

        {Array.from({ length: Math.max(1, rows) }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-8",
        className
      )}
    >
      <Spinner size="lg" label={label} />

      <p className="text-sm text-text-muted">{label}</p>

      {children}
    </div>
  );
}