"use client";

import { RotateCcw, TriangleAlert, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const OFFLINE_TITLE = "Connexion indisponible";
const OFFLINE_MESSAGE =
  "Vous êtes hors connexion. Vérifiez votre réseau mobile ou votre Wi-Fi puis réessayez.";

const DEFAULT_TITLE = "Une erreur est survenue";

export interface ErrorStateProps {
  /** Titre affiché au-dessus du message. */
  title?: string;
  /** Message d'erreur en français. Ignoré si `isOffline` est vrai. */
  message?: string;
  /** Affiche un message et une icône spécifiques à l'absence de réseau. */
  isOffline?: boolean;
  /** Callback du bouton « Réessayer ». Le bouton est masqué si absent. */
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title,
  message,
  isOffline = false,
  onRetry,
  className,
}: ErrorStateProps) {
  const resolvedTitle = isOffline ? OFFLINE_TITLE : (title ?? DEFAULT_TITLE);
  const resolvedMessage = isOffline
    ? OFFLINE_MESSAGE
    : (message ??
      "Impossible de charger les données. Veuillez réessayer dans quelques instants.");

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface-alt px-4 py-10 text-center",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-surface text-danger"
      >
        {isOffline ? (
          <WifiOff className="size-6" />
        ) : (
          <TriangleAlert className="size-6" />
        )}
      </span>

      <p className="text-base font-semibold text-text">{resolvedTitle}</p>
      <p className="max-w-md text-sm text-text-muted">{resolvedMessage}</p>

      {onRetry ? (
        <Button variant="outline" size="md" onClick={onRetry}>
          <RotateCcw aria-hidden="true" className="size-4" />
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}