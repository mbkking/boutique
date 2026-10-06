"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Contenu affiché avant les boutons (résumé de l'action). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` pour une action irréversible. */
  variant?: "primary" | "danger";
  isPending?: boolean;
  /** Action exécutée à la validation. */
  onConfirm: () => void | Promise<void>;
}

/**
 * Confirmation avant une action sensible.
 *
 * Annulation, archivage, retour au dépôt : ces opérations sont confirmées une
 * seconde fois parce qu'un clic sur « Annuler » ne doit pas pouvoir être une
 * erreur de destination.
 *
 * La validation est désactivée pendant l'action en cours : un double-clic ne
 * déclenche pas deux fois la même opération.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "primary",
  isPending,
  onConfirm,
}: ConfirmDialogProps) {
  const [localPending, setLocalPending] = useState(false);
  const pending = isPending ?? localPending;

  async function handleConfirm() {
    setLocalPending(true);
    try {
      await onConfirm();
    } finally {
      setLocalPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      description={description}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={handleConfirm}
            isLoading={pending}
            loadingLabel="Traitement"
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}