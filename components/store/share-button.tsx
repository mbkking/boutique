"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderProductShareCard } from "@/lib/share/share-card";

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
  /**
   * Photo du produit. Quand elle est fournie (avec `price`), le partage envoie
   * une carte image soignée (logo, photo, nom, prix, lien) au lieu d'un texte.
   */
  imageUrl?: string | null;
  /** Prix du produit, en FCFA. */
  price?: number;
  /** Prix barré éventuel (promotion). */
  compareAtPrice?: number | null;
  /** Nom de l'application, dessiné sur la carte. */
  siteName?: string;
  /** Logo de l'application, dessiné sur la carte. */
  logoUrl?: string;
  variant?: "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

type ShareState = "idle" | "shared" | "copied" | "error";

function slugifyForFilename(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 40) || "produit"
  );
}

/**
 * Bouton de partage.
 *
 * Deux niveaux :
 *
 * 1. **Carte image** — quand la photo et le prix sont connus, une carte de
 *    partage (logo, visuel, nom, prix, lien) est générée et envoyée via
 *    `navigator.share({ files })` sur mobile : l'image et le lien arrivent
 *    ensemble dans WhatsApp, canal dominant au Niger.
 * 2. **Repli texte** — si le partage de fichiers n'est pas supporté, on partage
 *    le texte et le lien ; à défaut, l'adresse est copiée.
 *
 * Le partage n'échoue jamais silencieusement : l'état « copié » est annoncé pour
 * que l'utilisateur sache que l'action a abouti.
 */
export function ShareButton({
  title,
  text,
  url,
  imageUrl,
  price,
  compareAtPrice,
  siteName,
  logoUrl,
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
    // L'URL par défaut n'est lisible que côté client ; la résoudre au moment du
    // clic évite un état intermédiaire calculé dans un effet.
    const target = url || window.location.href;

    // 1) Carte image + lien.
    if (imageUrl && typeof price === "number") {
      const blob = await renderProductShareCard({
        productName: title,
        price,
        imageUrl,
        compareAtPrice: compareAtPrice ?? null,
        url: target,
        siteName,
        logoUrl,
      }).catch(() => null);

      if (blob) {
        const file = new File([blob], `${slugifyForFilename(title)}.png`, {
          type: "image/png",
        });
        const shareData = { files: [file], title, text, url: target };

        if (
          typeof navigator.canShare === "function" &&
          navigator.canShare(shareData) &&
          typeof navigator.share === "function"
        ) {
          try {
            await navigator.share(shareData);
            setState("shared");
            return;
          } catch (error) {
            // Annulation par l'utilisateur : ce n'est pas un échec.
            if (error instanceof Error && error.name === "AbortError") return;
            // Sinon on poursuit vers le repli texte.
          }
        }
      }
    }

    // 2) Partage natif texte + lien.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url: target });
        setState("shared");
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }

    // 3) Presse-papier.
    try {
      await navigator.clipboard.writeText(target);
      setState("copied");
    } catch {
      setState("error");
    }
  }, [url, text, title, imageUrl, price, compareAtPrice, siteName, logoUrl]);

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
