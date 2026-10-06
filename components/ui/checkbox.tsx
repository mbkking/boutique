import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: ReactNode;
  /** Texte d'aide affiché sous le libellé. */
  hint?: ReactNode;
  error?: string | null;
}

/**
 * Case à cocher.
 *
 * Le champ natif est conservé et masqué visuellement plutôt que remplacé : la
 * navigation clavier, l'annonce par les lecteurs d'écran et le comportement
 * natif restent ceux du navigateur.
 *
 * La zone cliquable englobe le libellé : la cible tactile atteint44 px, ce qui
 * est la recommandation sur mobile.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, error, className, id, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  const control = (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
        "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white",
        "peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2",
        error ? "border-danger" : "border-border",
        props.disabled && "opacity-50"
      )}
      aria-hidden="true"
    >
      <Check className="size-3.5 opacity-0 peer-checked:opacity-100" />
    </span>
  );

  const input = (
    <input
      ref={ref}
      id={inputId}
      type="checkbox"
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className="peer sr-only"
      {...props}
    />
  );

  if (!label) {
    return (
      <span className={cn("relative inline-flex size-5 items-center justify-center", className)}>
        {input}
        {control}
      </span>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={inputId}
        className={cn(
          "tap-target flex cursor-pointer items-center gap-2.5 text-sm text-text",
          props.disabled && "cursor-not-allowed opacity-60"
        )}
      >
        {input}
        {control}
        <span>{label}</span>
      </label>

      {hint ? (
        <p id={hintId} className="pl-7 text-xs text-text-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="pl-7 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});