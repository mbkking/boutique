"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Empêche la fermeture par clic extérieur ou touche Échap. */
  dismissible?: boolean;
  className?: string;
}

/**
 * Boîte de dialogue modale.
 *
 * Implémentée sur l'élément natif `<dialog>` : la mise en focus, le piège de
 * tabulation, le retour à l'élément déclencheur et l'annonce aux lecteurs
 * d'écran sont fournis par le navigateur — plus fiables qu'une implémentation
 * manuelle, et sans dépendance supplémentaire.
 *
 * Le clic extérieur ne ferme que si la cible est le fond lui-même : sans cette
 * précision, un clic sur le contenu ferme la boîte par accident.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (open && !element.open) {
      element.showModal();
      return;
    }
    if (!open && element.open) {
      element.close();
    }
  }, [open]);

  // Le dialogue natif ne ferme que sur `cancel` (touche Échap) : on le
  // raccorde à notre gestionnaire pour respecter `dismissible`.
  const handleCancel = useCallback(
    (event: Event) => {
      if (!dismissible) {
        event.preventDefault();
        return;
      }
      onClose();
    },
    [dismissible, onClose]
  );

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener("cancel", handleCancel);
    return () => element.removeEventListener("cancel", handleCancel);
  }, [handleCancel]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(event) => {
        // Cible le fond : la boîte est l'élément racine du clic en dehors.
        if (dismissible && event.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] max-w-lg rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border p-4">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-base font-semibold text-text">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="text-sm text-text-muted">
              {description}
            </p>
          ) : null}
        </div>

        {dismissible ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="tap-target -m-1 rounded-lg p-1 text-text-muted hover:bg-surface-alt hover:text-text"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>

      {footer ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}