import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  /** Icône décorative affichée au-dessus du titre. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Libellé du bouton d'action. */
  actionLabel?: string;
  /** Si fourni, l'action devient un lien ; sinon le rendu est un `<button>`. */
  actionHref?: string;
  onAction?: () => void;
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface-alt px-4 py-10 text-center",
        className
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-full bg-surface text-primary"
        >
          {icon}
        </span>
      ) : null}

      <p className="text-base font-semibold text-text">{title}</p>

      {description ? (
        <p className="max-w-md text-sm text-text-muted">{description}</p>
      ) : null}

      {actionLabel && actionHref ? (
        <Link href={actionHref}>
          <Button variant="primary" size="md">
            {actionLabel}
          </Button>
        </Link>
      ) : actionLabel && onAction ? (
        <Button variant="primary" size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}

      {children}
    </div>
  );
}