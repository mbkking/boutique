"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Download, Share2, X } from "lucide-react";

/**
 * Invitation à installer l'application mobile (PWA).
 *
 * Affichée sur la boutique (jamais dans les espaces admin/livreur) quand
 * l'appareil peut installer l'application et qu'elle ne l'est pas encore. Un
 * visiteur venu d'un lien partagé voit ainsi apparaître un message et un bouton
 * de téléchargement de l'application.
 *
 * Deux cas :
 *  - Android / bureau compatible : l'événement `beforeinstallprompt` est capturé
 *    et son déclenchement est proposé sur le bouton ;
 *  - iOS : aucun événement d'installation n'existe, on explique le geste
 *    « Partager → Sur l'écran d'accueil ».
 *
 * Chaque étape (vue, clic, installation, rejet) est transmise au suivi pour
 * mesurer le parcours jusqu'à l'installation.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed-at";
const SESSION_KEY = "boutique_session_id";
/** Délai avant de reproposer l'installation après un rejet (ms) : 7 jours. */
const DISMISS_COOLDOWN = 7 * 24 * 60 * 60 * 1000;

function getSessionId(): string {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing && existing.length >= 8) return existing;
    const created =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return `anon-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function track(step: "shown" | "clicked" | "installed" | "dismissed"): void {
  try {
    const payload = JSON.stringify({ step, sessionId: getSessionId() });
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      navigator.sendBeacon("/api/pwa", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/pwa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Le suivi ne doit jamais gêner l'interface.
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return media || iosStandalone;
}

function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIpad =
    /Macintosh/.test(ua) && "ontouchend" in document;
  return /iPhone|iPad|iPod/.test(ua) || isIpad;
}

/** L'invitation a-t-elle été rejetée récemment (fenêtre de répit) ? */
function withinDismissCooldown(): boolean {
  try {
    const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
    return (
      Number.isFinite(dismissedAt) &&
      Date.now() - dismissedAt < DISMISS_COOLDOWN
    );
  } catch {
    return false;
  }
}

/**
 * Abonnement inerte : sert uniquement à distinguer le premier rendu serveur
 * du rendu client, sans provoquer d'écart d'hydratation.
 */
const subscribeClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function PwaInstallBanner({ logoUrl }: { logoUrl?: string } = {}) {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const shownTracked = useRef(false);
  const logoSrc = logoUrl || "/images/logo.jpeg";

  // `true` seulement après montage côté client : les API navigateur (stockage,
  // mode d'affichage) ne doivent pas être lues au rendu serveur.
  const isClient = useSyncExternalStore(
    subscribeClient,
    getClientSnapshot,
    getServerSnapshot
  );

  // Un espace de travail n'affiche jamais l'invitation d'installation boutique.
  const isStoreSpace =
    !pathname?.startsWith("/admin") &&
    !pathname?.startsWith("/driver") &&
    !pathname?.startsWith("/livreur");

  const eligible =
    isClient &&
    isStoreSpace &&
    !installed &&
    !dismissed &&
    !isStandalone() &&
    !withinDismissCooldown();

  const isIos = isClient && detectIos();

  // L'invitation n'apparaît que si un prompt natif est disponible (Android,
  // bureau compatible) ou sur iOS, où l'on explique le geste manuel.
  const visible = eligible && (deferredPrompt !== null || isIos);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      track("installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Suivi de l'affichage : une seule fois par session d'affichage.
  useEffect(() => {
    if (visible && !shownTracked.current) {
      shownTracked.current = true;
      track("shown");
    }
  }, [visible]);

  const handleInstall = useCallback(async () => {
    track("clicked");

    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") {
        setInstalled(true);
      } else {
        setDismissed(true);
      }
      return;
    }

    // Aucun prompt natif (iOS notamment) : on explique le geste.
    setShowIosHelp(true);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Sans stockage, l'invitation pourra revenir : ce n'est pas bloquant.
    }
    track("dismissed");
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Installer l'application"
      className="fixed inset-x-0 bottom-16 z-40 flex justify-center px-3 md:bottom-6"
      style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <Image
            src={logoSrc}
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-xl object-cover"
          />

          <div className="min-w-0 flex-1">
            {showIosHelp ? (
              <p className="text-sm text-text">
                Pour installer l&apos;application : ouvrez le menu{" "}
                <Share2 aria-hidden="true" className="inline size-3.5 align-text-bottom" />{" "}
                <span className="font-semibold">Partager</span> puis choisissez{" "}
                <span className="font-semibold">« Sur l&apos;écran d&apos;accueil »</span>.
              </p>
            ) : (
              <>
                <p className="text-sm font-semibold text-text">
                  Installez l&apos;application
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Commandez plus vite, suivez vos livraisons et recevez les alertes
                  de commande, directement depuis votre téléphone.
                </p>
              </>
            )}

            <div className="mt-3 flex items-center gap-2">
              {!showIosHelp ? (
                <button
                  type="button"
                  onClick={handleInstall}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-primary-dark focus-visible:focus-ring"
                >
                  <Download aria-hidden="true" className="size-4" />
                  Télécharger l&apos;application
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleDismiss}
                className="text-xs font-medium text-text-muted hover:text-text focus-visible:focus-ring"
              >
                Plus tard
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Fermer"
            className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-text-muted hover:bg-surface-alt focus-visible:focus-ring"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
