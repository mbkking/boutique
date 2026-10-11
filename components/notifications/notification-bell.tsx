"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, CheckCheck, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getMyNotificationsAction,
  type NotificationFeedItem,
} from "@/lib/actions/notifications";
import { cn } from "@/lib/utils";

/**
 * Centre de notifications interne, partagé par les trois espaces.
 *
 * Les notifications sont écrites en base par le service de notifications
 * (`notifications`), puis relues ici pour le profil courant. L'affichage se met
 * à jour :
 *
 *   1. en temps réel, par un abonnement Supabase Realtime filtré sur le profil
 *      (canal `notifications`), quand la table est publiée ;
 *   2. par rafraîchissement périodique et au retour d'onglet, ce qui garantit
 *      l'arrivée des messages même si le canal Realtime n'est pas disponible.
 *
 * Le concept de « lu » est volontairement local (horodatage dans le stockage du
 * navigateur) : il ne modifie pas la base de notifications, qui reste un
 * journal d'envoi.
 */

export interface NotificationBellProps {
  /** Espace d'affichage : ajuste les couleurs et les liens. */
  variant?: "store" | "admin" | "driver";
  /** Destination quand aucune commande précise n'est liée. */
  listHref: string;
  /**
   * Préfixe de la page de détail d'une commande. Ex. `/admin/orders/`.
   * `null` : pas de page de détail (l'espace livreur liste ses missions).
   */
  detailBase?: string | null;
}

/** Intervalle de repli quand le temps réel n'est pas disponible (ms). */
const REFRESH_INTERVAL = 30000;

function seenStorageKey(profileId: string): string {
  return `notif-seen:${profileId}`;
}

function readSeenAt(profileId: string): number {
  try {
    const raw = window.localStorage.getItem(seenStorageKey(profileId));
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function formatRelative(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "à l'instant";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

export function NotificationBell({
  variant = "store",
  listHref,
  detailBase = null,
}: NotificationBellProps) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationFeedItem[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  /**
   * Dernier profil dont l'horodatage « vu » a été chargé. Évite de relire le
   * stockage à chaque rafraîchissement périodique tout en le rafraîchissant
   * quand l'identité change.
   */
  const seenProfileRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const feed = await getMyNotificationsAction();
    setItems(feed.notifications);
    setLoaded(true);
    setProfileId(feed.profileId);
    if (feed.profileId && seenProfileRef.current !== feed.profileId) {
      seenProfileRef.current = feed.profileId;
      setSeenAt(readSeenAt(feed.profileId));
    }
  }, []);

  // Chargement initial. Différé d'un tick pour rester hors du corps de l'effet
  // (l'analyse React n'autorise la mise à jour d'état que dans un rappel).
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Temps réel + repli périodique + retour au premier plan.
  useEffect(() => {
    if (!profileId) return;

    const supabase = createClient();
    const channel = supabase.channel(`notif-${profileId}`);
    channel.on(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "postgres_changes" as any,
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${profileId}`,
      },
      () => {
        void load();
      }
    );

    let cancelled = false;
    const subscribe = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.access_token) {
        await supabase.realtime.setAuth(data.session.access_token);
      }
      if (cancelled) return;
      channel.subscribe();
    };
    void subscribe();

    const interval = window.setInterval(() => void load(), REFRESH_INTERVAL);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [profileId, load]);

  // Fermeture au clic extérieur / touche Échap.
  useEffect(() => {
    if (!open) return;

    function onClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markSeen = useCallback(() => {
    if (!profileId) return;
    const now = Date.now();
    setSeenAt(now);
    try {
      window.localStorage.setItem(seenStorageKey(profileId), String(now));
    } catch {
      // Stockage indisponible : le badge se réinitialisera à la prochaine visite.
    }
  }, [profileId]);

  const handleToggle = useCallback(() => {
    setOpen((previous) => {
      if (!previous) markSeen();
      return !previous;
    });
  }, [markSeen]);

  // Rendu nul tant que l'identité n'est pas connue, ou si personne n'est
  // connecté : aucun écart d'hydratation, aucune cloche pour un visiteur.
  if (!loaded || !profileId) return null;

  const unread = items.filter(
    (item) => new Date(item.createdAt).getTime() > seenAt
  ).length;

  const isStaff = variant !== "store";
  const buttonClasses = cn(
    "relative flex shrink-0 items-center justify-center rounded-lg p-2 transition-colors focus-visible:focus-ring",
    variant === "store"
      ? "text-text hover:bg-surface-alt"
      : variant === "driver"
        ? "text-gray-600 hover:bg-gray-100"
        : "text-gray-600 hover:bg-gray-100"
  );

  const hrefFor = (orderId: string | null) =>
    orderId && detailBase ? `${detailBase}${orderId}` : listHref;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-label={
          unread > 0
            ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}`
            : "Notifications"
        }
        className={buttonClasses}
      >
        {unread > 0 ? (
          <BellRing aria-hidden="true" className="size-5" />
        ) : (
          <Bell aria-hidden="true" className="size-5" />
        )}
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-surface">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={cn(
            "absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border shadow-lg",
            variant === "store" ? "border-border bg-surface" : "border-gray-200 bg-white"
          )}
        >
          <div
            className={cn(
              "flex items-center justify-between border-b px-4 py-3",
              variant === "store" ? "border-border-light" : "border-gray-100"
            )}
          >
            <span
              className={cn(
                "text-sm font-semibold",
                variant === "store" ? "text-text" : "text-gray-900"
              )}
            >
              Notifications
            </span>
            {items.length > 0 ? (
              <button
                type="button"
                onClick={markSeen}
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium",
                  variant === "store"
                    ? "text-primary hover:text-primary-dark"
                    : variant === "driver"
                      ? "text-green-700 hover:text-green-800"
                      : "text-primary-light hover:text-primary"
                )}
              >
                <CheckCheck aria-hidden="true" className="size-3.5" />
                Tout marquer lu
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <Inbox
                aria-hidden="true"
                className={cn("size-6", variant === "store" ? "text-text-light" : "text-gray-300")}
              />
              <p className={cn("text-sm", variant === "store" ? "text-text-muted" : "text-gray-500")}>
                Aucune notification pour le moment.
              </p>
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((item) => {
                const isUnread = new Date(item.createdAt).getTime() > seenAt;
                return (
                  <li key={item.id}>
                    <Link
                      href={hrefFor(item.orderId)}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex flex-col gap-0.5 border-b px-4 py-3 transition-colors last:border-b-0",
                        variant === "store" ? "border-border-light" : "border-gray-100",
                        variant === "store" ? "hover:bg-surface-alt" : "hover:bg-gray-50",
                        isUnread && (variant === "store" ? "bg-primary-50/50" : "bg-primary-50/40")
                      )}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            "text-sm",
                            isUnread ? "font-semibold" : "font-medium",
                            variant === "store" ? "text-text" : "text-gray-900"
                          )}
                        >
                          {item.title}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[11px]",
                            variant === "store" ? "text-text-light" : "text-gray-400"
                          )}
                        >
                          {formatRelative(item.createdAt)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "text-xs",
                          variant === "store" ? "text-text-muted" : "text-gray-500"
                        )}
                      >
                        {item.body}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {items.length > 0 ? (
            <div
              className={cn(
                "border-t px-4 py-2 text-center",
                variant === "store" ? "border-border-light" : "border-gray-100"
              )}
            >
              <Link
                href={listHref}
                onClick={() => setOpen(false)}
                className={cn(
                  "text-xs font-medium",
                  variant === "store"
                    ? "text-primary hover:text-primary-dark"
                    : variant === "driver"
                      ? "text-green-700"
                      : "text-primary-light"
                )}
              >
                {isStaff ? "Voir les commandes" : "Voir mes commandes"}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
