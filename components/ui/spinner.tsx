import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  sm: "size-4",
  md: "size-5",
  lg: "size-8",
} as const;

export type SpinnerSize = keyof typeof SIZE_CLASSES;

export interface SpinnerProps {
  size?: SpinnerSize;
  /** Message lu par les lecteurs d'écran. */
  label?: string;
  className?: string;
}

/**
 * Indicateur de chargement animé, annoncé aux technologies d'assistance.
 */
export function Spinner({
  size = "md",
  label = "Chargement en cours",
  className,
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
    >
      <LoaderCircle
        aria-hidden="true"
        className={cn(
          "animate-spin text-primary",
          SIZE_CLASSES[size]
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}