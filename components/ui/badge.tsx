import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const BADGE_VARIANTS = {
  neutral: "bg-surface-alt text-text-muted border-border",
  success: "bg-success/10 text-success border-success/40",
  warning: "bg-warning/10 text-warning border-warning/40",
  danger: "bg-danger/10 text-danger border-danger/40",
  info: "bg-info/10 text-info border-info/40",
} as const;

export type BadgeVariant = keyof typeof BADGE_VARIANTS;

export interface BadgeProps {
  variant?: BadgeVariant;
  /** Icône décorative accompagnant le libellé (jamais seule). */
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Étiquette de statut.
 *
 * Règle d'accessibilité (§33) : la couleur ne doit jamais être le seul signal.
 * Le composant attend donc toujours un libellé textuel (`children`) et accepte
 * une icône en complément.
 */
export function Badge({
  variant = "neutral",
  icon,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      data-admin-badge={variant === "neutral" ? "true" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        BADGE_VARIANTS[variant],
        className
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}