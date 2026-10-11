"use client";

import { useCallback, useEffect, useState } from "react";
import { BellOff, BellPlus, BellRing, Loader2 } from "lucide-react";
import {
  getPushConfigAction,
  subscribePushAction,
  unsubscribePushAction,
} from "@/lib/actions/push";
import { cn } from "@/lib/utils";

/**
 * Activation des notifications système (Web Push) dans la cloche interne.
 *
 * La cloche affiche les notifications reçues tant que l'onglet est ouvert. Ce
 * contrôle va plus loin : il demande au navigateur l'autorisation d'afficher
 * des notifications **application fermée** et enregistre l'abonnement auprès du
 * serveur, rattaché au profil connecté.
 *
 * Le composant ne se rend qu'une fois monté : `Notification`, `PushManager` et
 * le service worker n'existent pas au rendu serveur.
 */

export interface PushToggleProps {
  variant?: "store" | "admin" | "driver";
}

type Status =
  | "loading"
  | "unsupported"
  | "unconfigured"
  | "denied"
  | "off"
  | "on"
  | "working";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** Service worker actif, ou `null` s'il n'y en a pas (développement, support absent). */
async function getActiveRegistration(timeoutMs = 5000): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing?.active) return existing;

  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

export function PushToggle({ variant = "store" }: PushToggleProps) {
  const [status, setStatus] = useState<Status>("loading");

  const refresh = useCallback(async () => {
    const supported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    if (!supported) {
      setStatus("unsupported");
      return;
    }

    const config = await getPushConfigAction();
    if (!config.configured || !config.publicKey) {
      setStatus("unconfigured");
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    const registration = await getActiveRegistration();
    const subscription = registration
      ? await registration.pushManager.getSubscription()
      : null;
    setStatus(subscription ? "on" : "off");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const enable = useCallback(async () => {
    setStatus("working");
    try {
      const config = await getPushConfigAction();
      if (!config.configured || !config.publicKey) {
        setStatus("unconfigured");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      const registration = await getActiveRegistration(10000);
      if (!registration) {
        // Pas de service worker actif : impossible de recevoir hors ligne.
        setStatus("unsupported");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });

      const json = subscription.toJSON();
      const result = await subscribePushAction({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        origin: window.location.origin,
        userAgent: navigator.userAgent.slice(0, 500),
      });

      if (!result.success) {
        // L'abonnement local ne sert à rien si le serveur ne le connaît pas.
        await subscription.unsubscribe();
        setStatus("off");
        return;
      }

      setStatus("on");
    } catch {
      setStatus("off");
    }
  }, []);

  const disable = useCallback(async () => {
    setStatus("working");
    try {
      const registration = await getActiveRegistration();
      const subscription = registration
        ? await registration.pushManager.getSubscription()
        : null;

      if (subscription) {
        await unsubscribePushAction(subscription.endpoint);
        await subscription.unsubscribe();
      }

      setStatus("off");
    } catch {
      await refresh();
    }
  }, [refresh]);

  if (status === "loading") return null;

  const containerClasses = cn(
    "flex items-start gap-2 border-t px-4 py-3 text-xs",
    variant === "store" ? "border-border-light" : "border-gray-100"
  );
  const textClasses = cn(variant === "store" ? "text-text-muted" : "text-gray-500");
  const linkClasses = cn(
    "inline-flex items-center gap-1 font-medium",
    variant === "store"
      ? "text-primary hover:text-primary-dark"
      : variant === "driver"
        ? "text-green-700 hover:text-green-800"
        : "text-primary-light hover:text-primary"
  );

  if (status === "unsupported") {
    return (
      <div className={containerClasses}>
        <BellOff aria-hidden="true" className={cn("mt-0.5 size-3.5 shrink-0", textClasses)} />
        <span className={textClasses}>
          Cet appareil ne prend pas en charge les notifications système.
        </span>
      </div>
    );
  }

  if (status === "unconfigured") {
    return (
      <div className={containerClasses}>
        <BellOff aria-hidden="true" className={cn("mt-0.5 size-3.5 shrink-0", textClasses)} />
        <span className={textClasses}>Notifications système indisponibles pour le moment.</span>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className={containerClasses}>
        <BellOff aria-hidden="true" className={cn("mt-0.5 size-3.5 shrink-0", textClasses)} />
        <span className={textClasses}>
          Notifications bloquées. Autorisez-les dans les réglages du navigateur pour ce site.
        </span>
      </div>
    );
  }

  const working = status === "working";

  return (
    <div className={containerClasses}>
      <BellRing aria-hidden="true" className={cn("mt-0.5 size-3.5 shrink-0", textClasses)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={textClasses}>
          {status === "on"
            ? "Notifications système activées sur cet appareil."
            : "Recevez une alerte même application fermée."}
        </span>
        <button
          type="button"
          onClick={status === "on" ? disable : enable}
          disabled={working}
          className={cn(linkClasses, working && "opacity-60")}
        >
          {working ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : status === "on" ? (
            <BellOff aria-hidden="true" className="size-3.5" />
          ) : (
            <BellPlus aria-hidden="true" className="size-3.5" />
          )}
          {status === "on" ? "Désactiver" : "Activer les notifications"}
        </button>
      </div>
    </div>
  );
}
