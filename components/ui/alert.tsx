import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertVariant = "info" | "success" | "warning" | "danger";

export interface AlertProps {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  /** Rend l'alerte non repliable. Par défaut elle peut être masquée. */
  inline?: boolean;
  className?: string;
}

const VARIANT_STYLES: Record<AlertVariant, string> = {
  info: "border-primary-100 bg-primary-50 text-primary-dark",
  success: "border-green-200 bg-green-50 text-green-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
};

const VARIANT_ICONS: Record<AlertVariant, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

/**
 * Bandeau d'information contextuel.
 *
 * `role="alert"` pour les variantes graves (danger, warning) : le contenu est
 * annoncé immédiatement. `role="status"` pour les autres, qui sont informatifs.
 *
 * La couleur n'est jamais le seul signal : chaque variante porte une icône et,
 * pour `danger`, un titre explicite.
 */
export function Alert({
  variant = "info",
  title,
  children,
  inline = false,
  className,
}: AlertProps) {
  const Icon = VARIANT_ICONS[variant];
  const isUrgent = variant === "danger" || variant === "warning";

  return (
    <div
      role={isUrgent ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4",
        inline && "py-2.5",
        VARIANT_STYLES[variant],
        className
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="text-sm font-semibold">{title}</p> : null}
        {children ? <div className="text-sm leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}