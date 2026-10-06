"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface QuantitySelectorProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** Nom transmis avec le champ caché, pour les formulaires HTML. */
  name?: string;
  /** Étiquette accessible du groupe de boutons. */
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Sélecteur de quantité.
 *
 * Les boutons natifs sont utilisés plutôt qu'un `input[type=number]` seul :
 * sur mobile, les deux boutons donnent une cible tactile d'au moins 44 px, alors
 * que les pas à pas natifs sont minuscules et parfois masqués par le clavier.
 *
 * Le champ caché conserve la valeur pour une soumission de formulaire classique.
 */
export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 99,
  name,
  label = "Quantité",
  disabled,
  className,
}: QuantitySelectorProps) {
  const safeMax = Math.max(min, max);
  const current = Math.min(Math.max(value, min), safeMax);

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <Button
        type="button"
        variant="outline"
        size="md"
        aria-label="Diminuer la quantité"
        disabled={disabled || current <= min}
        onClick={() => onChange(Math.max(min, current - 1))}
      >
        <Minus aria-hidden="true" className="size-4" />
      </Button>

      <span
        aria-live="polite"
        className="min-w-10 text-center text-base font-semibold text-text"
      >
        <span className="sr-only">{`${label} : `}</span>
        {current}
      </span>

      <Button
        type="button"
        variant="outline"
        size="md"
        aria-label="Augmenter la quantité"
        disabled={disabled || current >= safeMax}
        onClick={() => onChange(Math.min(safeMax, current + 1))}
      >
        <Plus aria-hidden="true" className="size-4" />
      </Button>

      {name ? <input type="hidden" name={name} value={current} /> : null}
    </div>
  );
}