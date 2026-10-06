import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface RadioOption {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  /** Nom du groupe, partagé par les champs natifs. */
  name: string;
  legend: ReactNode;
  options: readonly RadioOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  error?: string | null;
  hint?: ReactNode;
  className?: string;
}

/**
 * Groupe de boutons radio.
 *
 * Champ natif conservé et masqué : le comportement clavier (flèches pour
 * changer d'option) et l'annonce « 2 sur 4 » restent gérés par le navigateur.
 * L'erreur est reliée via `aria-describedby`, et `role="alert"` permet de
 * l'entendre immédiatement.
 */
export function RadioGroup({
  name,
  legend,
  options,
  value,
  defaultValue,
  onChange,
  error,
  hint,
  className,
}: RadioGroupProps) {
  const generatedName = useId();
  const groupName = name || generatedName;
  const errorId = `${groupName}-error`;
  const hintId = `${groupName}-hint`;

  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <fieldset
      className={cn("flex flex-col gap-2", className)}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
    >
      <legend className="text-sm font-medium text-text">{legend}</legend>

      {hint ? (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {options.map((option) => {
          const optionId = `${groupName}-${option.value}`;

          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className={cn(
                "tap-target flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-sm text-text transition-colors",
                "has-[:checked]:border-primary has-[:checked]:bg-primary/5",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2",
                option.disabled && "cursor-not-allowed opacity-60"
              )}
            >
              <input
                id={optionId}
                type="radio"
                name={groupName}
                value={option.value}
                disabled={option.disabled}
                checked={value === option.value}
                defaultChecked={value === undefined && defaultValue === option.value}
                onChange={(event) => onChange?.(event.target.value)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{option.label}</span>
                {option.hint ? (
                  <span className="text-xs text-text-muted">{option.hint}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
