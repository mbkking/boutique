"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin } from "lucide-react";
import { shareOrderLocationAction } from "@/lib/actions/orders";
import { Button } from "@/components/ui/button";

type ShareLocationState = "idle" | "locating" | "shared" | "denied" | "error";

interface ShareLocationButtonProps {
  /** Identifiant de la commande : la position y est fusionnée côté serveur. */
  orderId: string;
  /** Une position a déjà été transmise : le bouton invite alors à la mettre à jour. */
  hasLocation?: boolean;
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Bouton « Partager ma position ».
 *
 * Le navigateur demande l'autorisation de localisation, puis la position est
 * envoyée à une server action qui la contrôle et l'inscrit sur la commande. Le
 * livreur affecté la retrouve comme repère de navigation.
 *
 * Aucun échec n'est silencieux : refus d'autorisation, indisponibilité ou
 * erreur serveur donnent un message explicite, jamais un bouton inerte.
 */
export function ShareLocationButton({
  orderId,
  hasLocation = false,
  variant = "outline",
  size = "sm",
  className,
}: ShareLocationButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<ShareLocationState>(hasLocation ? "shared" : "idle");
  const [message, setMessage] = useState<string | null>(null);

  function handleShare() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState("error");
      setMessage("La localisation n'est pas disponible sur cet appareil.");
      return;
    }

    setState("locating");
    setMessage(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const result = await shareOrderLocationAction({
          orderId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        if (!result.success) {
          setState("error");
          setMessage(result.error);
          return;
        }

        setState("shared");
        setMessage("Position partagée avec le livreur.");
        router.refresh();
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        setState(denied ? "denied" : "error");
        setMessage(
          denied
            ? "Autorisation refusée. Activez la localisation dans votre navigateur."
            : "Position introuvable. Vérifiez que le GPS est activé et réessayez."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  const isError = state === "error" || state === "denied";

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleShare}
        disabled={state === "locating"}
        isLoading={state === "locating"}
        loadingLabel="Localisation…"
        className={className}
      >
        {state === "shared" ? (
          <Check aria-hidden="true" className="size-4 text-success" />
        ) : (
          <MapPin aria-hidden="true" className="size-4" />
        )}
        {state === "shared" ? "Mettre à jour ma position" : "Partager ma position"}
      </Button>

      {message ? (
        <p
          role={isError ? "alert" : "status"}
          className={isError ? "text-xs text-danger" : "text-xs text-success"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
