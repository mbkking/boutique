"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/session";
import { logger } from "@/lib/observability/logger";

/**
 * Lecture des notifications internes de l'utilisateur connecté.
 *
 * La lecture passe par le client privilégié (service role) filtré sur le profil
 * courant plutôt que par le client de session : la table `notifications` n'a pas
 * de politique de lecture publique garantie, et une notification est une donnée
 * strictement personnelle. On ne renvoie donc jamais qu'une seule adresse : la
 * sienne.
 *
 * Aucun échec ne remonte à l'interface — une cloche qui ne s'affiche pas ne doit
 * jamais casser une page.
 */

export interface NotificationFeedItem {
  id: string;
  /** Identifiant de la commande concernée, si la notification en porte une. */
  orderId: string | null;
  type: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface NotificationFeed {
  /** `null` quand personne n'est connecté : la cloche ne se rend alors pas. */
  profileId: string | null;
  notifications: NotificationFeedItem[];
}

export async function getMyNotificationsAction(limit = 25): Promise<NotificationFeed> {
  const profile = await getSessionProfile();
  if (!profile) return { profileId: null, notifications: [] };

  try {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("id, order_id, type, title, body, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 50));

    if (error) {
      logger.warn("notifications: lecture impossible", { error: error.message });
      return { profileId: profile.id, notifications: [] };
    }

    return {
      profileId: profile.id,
      notifications: (data ?? []).map((row) => ({
        id: row.id,
        orderId: row.order_id ?? null,
        type: row.type,
        title: row.title,
        body: row.body,
        createdAt: row.created_at,
      })),
    };
  } catch (error) {
    logger.warn("notifications: lecture impossible", { error });
    return { profileId: profile.id, notifications: [] };
  }
}
