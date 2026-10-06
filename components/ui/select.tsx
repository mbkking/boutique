"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.ComponentPropsWithRef<"select"> {
  /** Libellé visible, toujours obligatoire pour l'accessibilité. */
  label: string;
  /** Texte d'aide affiché sous le champ. Masqué quand une erreur est présente. */
  hint?: string;
  /** Message d'erreur en français, annoncé via `role="alert"`. */
  error?: string | null;
}

export function Select({
  label,
  hint,
  error,
  className,
  id,
  required,
  "aria-describedby": ariaDescribedBy,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = `${selectId}-hint`;
  const errorId = `${selectId}-error`;

  const describedBy =
    [error ? errorId : null, hint ? hintId : null, ariaDescribedBy]
      .filter((value): value is string => Boolean(value))
      .join(" ") || undefined;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-text">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>

      <div className="relative">
        <select
          id={selectId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "tap-target w-full appearance-none rounded-lg border bg-surface py-2 pl-3 pr-10 text-text",
            "focus-visible:focus-ring disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-text-muted",
            error ? "border-danger" : "border-border",
            className
          )}
          {...props}
        />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        />
      </div>

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