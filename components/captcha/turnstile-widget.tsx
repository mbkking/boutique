"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Widget Cloudflare Turnstile, chargé à la demande.
 *
 * Le script est injecté seulement si une clé publique est configurée : sans
 * elle, aucun octet supplémentaire n'est téléchargé et le checkout reste
 * utilisable. Turnstile est choisi pour son fonctionnement sans puzzle —
 * c'est un point décisif au Niger, où une connexion mobile interrompue fait
 * abandonner une commande que le client ne peut pas finir.
 */
const SCRIPT_ID = "turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileWidgetProps {
  siteKey: string;
  onToken: (token: string | null) => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
          theme?: "auto" | "light" | "dark";
          language?: string;
        }
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}

function loadScript(): Promise<void> {
  if (document.getElementById(SCRIPT_ID)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Script Turnstile indisponible"));
    document.head.appendChild(script);
  });
}

export function TurnstileWidget({ siteKey, onToken }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            onToken(token);
            setStatus("ready");
          },
          "expired-callback": () => onToken(null),
          "error-callback": () => {
            // Le widget est en échec, mais les deux autres barrières restent
            // actives : on ne bloque pas la commande pour autant.
            setStatus("failed");
          },
          theme: "auto",
          language: "fr",
        });
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [siteKey, onToken]);

  if (status === "failed") {
    return (
      <p className="text-xs text-muted">
        Vérification anti-robot indisponible. Les autres protections restent actives.
      </p>
    );
  }

  return (
    <div className="min-h-0" aria-busy={status === "loading"}>
      <div ref={containerRef} />
    </div>
  );
}