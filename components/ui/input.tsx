"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends Omit<React.ComponentPropsWithRef<"input">, "size"> {
  /** Libellé visible, toujours obligatoire pour l'accessibilité. */
  label: string;
  /** Texte d'aide affiché sous le champ. Masqué quand une erreur est présente. */
  hint?: string;
  /** Message d'erreur en français, annoncé via `role="alert"`. */
  error?: string | null;
}

export function Input({
  label,
  hint,
  error,
  className,
  id,
  required,
  "aria-describedby": ariaDescribedBy,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy =
    [error ? errorId : null, hint ? hintId : null, ariaDescribedBy]
      .filter((value): value is string => Boolean(value))
      .join(" ") || undefined;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-text"
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>

      <input
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "tap-target w-full rounded-lg border bg-surface px-3 py-2 text-text placeholder:text-text-muted",
          "focus-visible:focus-ring disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-text-muted",
          error ? "border-danger" : "border-border",
          className
        )}
        {...props}
      />

      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}