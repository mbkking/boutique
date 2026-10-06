"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** `start` pour le menu (gauche), `end` pour le panier (droite), `bottom` pour une feuille. */
  side?: "start" | "end" | "bottom";
  children: ReactNode;
  /** Bouton de fermeture visible. `false` pour un tiroir à glissement obligatoire. */
  showCloseButton?: boolean;
  className?: string;
}

/**
 * Tiroir latéral, en particulier sur mobile.
 *
 * Le panneau reste monté et passe par `inert` quand il est fermé : c'est ce qui
 * empêche le clavier et les lecteurs d'écran d'atteindre un menu invisible.
 * Le retirer du DOM ferait disparaître l'animation de sortie et, surtout,
 * perdrait l'état interne du panier à chaque fermeture.
 *
 * L'ouverture verrouille le défilement derrière le panneau, piège le focus,
 * ferme sur Échap et rend le focus au bouton déclencheur à la fermeture — sans
 * quoi un utilisateur clavier se retrouve à tabuler dans la page masquée.
 */
export function Drawer({
  open,
  onClose,
  title,
  side = "start",
  children,
  showCloseButton = true,
  className,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Mémorise l'élément qui avait le focus avant l'ouverture.
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      return;
    }
    triggerRef.current?.focus?.();
  }, [open]);

  // Verrouille le défilement de la page derrière le tiroir.
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Piège de tabulation : le focus ne doit jamais sortir du panneau.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  return (
    <div
      inert={!open}
      className={cn(
        "fixed inset-0 z-40",
        !open && "pointer-events-none"
      )}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-text/40 transition-opacity",
          open ? "opacity-100" : "opacity-0"
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className={cn(
          "absolute flex flex-col gap-1 border-border bg-surface p-4 transition-transform duration-200",
          className,
          side === "bottom"
            ? cn(
                "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t",
                open ? "translate-y-0" : "translate-y-full"
              )
            : cn(
                "inset-y-0 w-80 max-w-[85%]",
                side === "start"
                  ? cn("left-0 border-r", open ? "translate-x-0" : "-translate-x-full")
                  : cn("right-0 border-l", open ? "translate-x-0" : "translate-x-full")
              )
        )}
      >
        <div className="mb-2 flex items-center justify-between">
          <span id={titleId} className="text-base font-bold text-primary">
            {title}
          </span>
          {showCloseButton ? (
            <button
              type="button"
              aria-label="Fermer"
              onClick={onClose}
              className="tap-target flex items-center justify-center rounded-lg text-text-muted hover:bg-surface-alt focus-visible:focus-ring"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          ) : null}
        </div>

        {children}
      </div>
    </div>
  );
}