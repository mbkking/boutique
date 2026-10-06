"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Rafraîchissement temps réel d'un écran.
 *
 * Les trois applications partagent la même base Supabase : un événement publié
 * sur `orders`, `deliveries` ou `notifications` est reçu par tous les clients
 * autorisés à lire la ligne concernée (les politiques RLS s'appliquent aussi
 * aux canaux Realtime).
 *
 * Le callback sert à revalider l'affichage — dans cette application, un
 * `router.refresh()`. Le rechargement ne porte que sur la page affichée : rien
 * n'est rechargé « en aveugle ».
 */

export interface RealtimeBinding {
  /** Table écoutée (`orders`, `deliveries`, `delivery_events`, `notifications`). */
  table: string;
  /**
   * Filtre PostgreSQL, même syntaxe que dans l'URL de l'API REST.
   * Exemple : `driver_id=eq.<uuid>` ou `id=eq.<uuid>`.
   *
   * Indispensable pour le livreur : il ne doit recevoir que ses livraisons.
   */
  filter?: string;
}

export function useRealtimeRefresh(
  bindings: RealtimeBinding[],
  onChange: () => void
): void {
  // La référence du callback vit dans un effet : elle est lue par l'abonnement,
  // jamais pendant le rendu.
  const handler = useRef(onChange);

  useEffect(() => {
    handler.current = onChange;
  }, [onChange]);

  const key = JSON.stringify(bindings);
  const bindingSummary = bindings
    .map((binding) => `${binding.table}${binding.filter ? `(${binding.filter})` : ""}`)
    .join(", ");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`realtime-${key}`);

    for (const binding of JSON.parse(key) as RealtimeBinding[]) {
      channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: binding.table,
          ...(binding.filter ? { filter: binding.filter } : {}),
        },
        () => {
          if (process.env.NODE_ENV !== "production") {
            console.info(`[realtime] ${bindingSummary} — événement reçu`);
          }
          handler.current();
        }
      );
    }

    let cancelled = false;

    /**
     * Le canal doit porter le jeton de session.
     *
     * Sans lui, Realtime applique les politiques RLS au rôle `anon` : le canal
     * se souscrit bien (`SUBSCRIBED`) mais aucun événement n'est transmis.
     */
    const subscribe = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (data.session?.access_token) {
        await supabase.realtime.setAuth(data.session.access_token);
      }

      if (cancelled) return;

      channel.subscribe((status: string, error?: Error) => {
        // Trace utile en développement : un abonnement qui échoue (RLS, réseau)
        // ne doit pas être silencieux.
        if (process.env.NODE_ENV !== "production") {
          console.info(
            `[realtime] ${bindingSummary} — statut : ${status}`,
            error?.message ?? ""
          );
        }
      });
    };

    void subscribe();

    return () => {
      cancelled = true;
      // Libérer le canal : sans cela, un changement de page laisse le canal
      // ouvert et l'événement continue d'arriver.
      void supabase.removeChannel(channel);
    };
  }, [key]);
}