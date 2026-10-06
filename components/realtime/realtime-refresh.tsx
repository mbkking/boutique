"use client";

import { useRouter } from "next/navigation";
import { useRealtimeRefresh } from "@/lib/realtime/use-realtime-refresh";
import type { RealtimeBinding } from "@/lib/realtime/use-realtime-refresh";

/**
 * Rafraîchit l'écran courant quand les tables suivies changent.
 *
 * Le composant ne rend rien : c'est un simple pont entre le canal Realtime et
 * le rechargement des données serveur de la page.
 */
export function RealtimeRefresh({ bindings }: { bindings: RealtimeBinding[] }) {
  const router = useRouter();
  useRealtimeRefresh(bindings, () => router.refresh());

  // Marqueur discret : permet de vérifier (en test ou en inspection) qu'un
  // écran écoute bien le temps réel, sans rien afficher.
  return (
    <span
      hidden
      data-realtime-tables={bindings.map((binding) => binding.table).join(",")}
    />
  );
}