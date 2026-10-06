"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  /** Titre de l'élément partagé (produit, catégorie…). */
  title: string;
  /** Texte de présentation, affiché dans le sélecteur natif. */
  text?: string;
  /**
   * URL partagée. Par défaut l'adresse courante.
   * Propager l'URL explicite évite de partager une page de résultats ou une
   * URL porteur d'un état de filtre.
   */
  url?: string;
  variant?: "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

type ShareState = "idle" | "shared" | "copied" | "error";

/**
 * Bouton de partage.
 *
 * Sur mobile, on délègue au sélecteur natif (`navigator.share`), ce qui propose
 * WhatsApp — canal dominant au Niger. Sur poste fixe, on recopie l'adresse, ce
 * seul chemin restant disponible.
 *
 * Le partage n'échoue jamais silencieusement : l'état « copié » est annoncé pour
 * que l'utilisateur sache que l'action a abouti.
 */
export function ShareButton({
  title,
  text,
  url,
  variant = "outline",
  size = "sm",
}: ShareButtonProps) {
  const [state, setState] = useState<ShareState>("idle");

  // Un message de confirmation ne doit pas rester affiché indéfiniment.
  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [state]);

  const handleShare = useCallback(async () => {
    // L'URL par défaut n'est lisible qu côté client ; la résoudre au moment du
    // clic évite un état intermédiaire calculé dans un effet.
    const target = url || window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: target });
        setState("shared");
        return;
      } catch (error) {
        // L'utilisateur a pu annuler le sélecteur : ce n'est pas une erreur.
        if (error instanceof Error && error.name === "AbortError") return;
        // Tout autre échec bascule sur la copie presse-papier.
      }
    }

    try {
      await navigator.clipboard.writeText(target);
      setState("copied");
    } catch {
      setState("error");
    }
  }, [url, text, title]);

  const label =
    state === "copied"
      ? "Lien copié"
      : state === "shared"
        ? "Partagé"
        : state === "error"
          ? "Partage impossible"
          : "Partager";

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleShare}
      aria-label={`Partager : ${title}`}
      className={state === "error" ? "text-danger" : undefined}
    >
      {state === "copied" ? (
        <Check aria-hidden="true" className="size-4 text-success" />
      ) : (
        <Share2 aria-hidden="true" className="size-4" />
      )}
      {label}
    </Button>
  );
}