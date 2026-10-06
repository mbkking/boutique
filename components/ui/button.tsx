"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner, type SpinnerSize } from "@/components/ui/spinner";

const VARIANT_CLASSES = {
  primary:
    "bg-primary text-surface hover:bg-primary-dark",
  secondary:
    "bg-secondary text-text hover:bg-warning",
  danger:
    "bg-danger text-surface hover:opacity-90",
  ghost:
    "bg-transparent text-text hover:bg-surface-alt",
  outline:
    "bg-surface text-primary border border-primary hover:bg-surface-alt",
} as const;

const SIZE_CLASSES = {
  sm: "px-3 py-1.5 text-sm rounded-md",
  md: "px-4 py-2 text-sm rounded-lg tap-target",
  lg: "px-6 py-3 text-base rounded-lg tap-target",
} as const;

const SPINNER_SIZE: Record<keyof typeof SIZE_CLASSES, SpinnerSize> = {
  sm: "sm",
  md: "sm",
  lg: "md",
};

export type ButtonVariant = keyof typeof VARIANT_CLASSES;
export type ButtonSize = keyof typeof SIZE_CLASSES;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  /** Message lu par les lecteurs d'écran pendant le chargement. */
  loadingLabel?: string;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  loadingLabel = "Chargement en cours",
  className,
  disabled,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      // La couche de thème du back-office (`globals.css`) s'appuie sur cet
      // attribut : l'apparence du bouton devient pilotable depuis les
      // paramètres, sans réécrire le composant. Sans effet hors admin.
      data-admin-button={variant === "primary" ? "true" : undefined}
      className={cn(
        "relative inline-flex items-center justify-center font-medium transition-colors",
        "focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    >
      {/*
        Le contenu réel reste dans le flux (mais invisible) pendant le
        chargement : la largeur du bouton ne change donc jamais.
      */}
      <span
        aria-hidden={isLoading || undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2",
          isLoading && "invisible"
        )}
      >
        {children}
      </span>
      {isLoading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={SPINNER_SIZE[size]} label={loadingLabel} />
        </span>
      ) : null}
    </button>
  );
}