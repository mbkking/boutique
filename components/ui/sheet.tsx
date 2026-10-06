"use client";

import type { ReactNode } from "react";
import { Drawer } from "@/components/ui/drawer";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  showCloseButton?: boolean;
  className?: string;
}

/**
 * Feuille remontant du bas de l'écran.
 *
 * Variante d'ancrage du `Drawer`, destinée aux actions qui arrivent du bas sur
 * téléphone : filtres, choix de quantité, panier. Elle réutilise volontairement
 * le même composant plutôt qu'une seconde implémentation — le piégeage du focus,
 * le verrouillage du défilement et le retour de focus n'ont qu'une version à
 * corriger.
 *
 * Sur grand écran, une feuille ancrée au bas laisse une grande zone vide au
 *-dessus : c'est pourquoi le tiroir latéral reste préférable au-delà de 640 px.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  showCloseButton = true,
  className,
}: SheetProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      side="bottom"
      showCloseButton={showCloseButton}
      className={className}
    >
      {children}
    </Drawer>
  );
}