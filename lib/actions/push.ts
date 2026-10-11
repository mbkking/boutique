"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/session";
import { logger } from "@/lib/observability/logger";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";

/**
 * Gestion des abonnements Web Push (§45).
 *
 * Le navigateur produit un abonnement auprès de son service de push ; il n'a de
 * valeur que rattaché à un profil. Les server actions ci-dessous font le lien :
 * la session authentifiée décide **à qui** appartient l'abonnement, jamais le
 * client. L'écriture passe par le client service role (la table est en RLS).
 */

export interface PushConfig {
  /** `true` quand les deux clés VAPID sont présentes côté serveur. */
  configured: boolean;
  /** Clé publique VAPID, transmise au navigateur pour s'abonner. */
  publicKey: string | null;
}

const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
  // Origine de l'application émettrice (client, admin, livreur) : sert à
  // construire le lien de la notification. Un schéma non web est refusé, ce qui
  // écarte un `javascript:` déguisé.
  origin: z
    .string()
    .url()
    .max(200)
    .refine((value) => /^https?:\/\//.test(value), "Origine invalide"),
  userAgent: z.string().max(500).optional(),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
});

/** Configuration poussée au client : clé publique et disponibilité. */
export async function getPushConfigAction(): Promise<PushConfig> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || null;
  return { configured: Boolean(publicKey && privateKey), publicKey };
}

/**
 * Enregistre ou met à jour l'abonnement du profil connecté.
 *
 * `endpoint` est unique : se reconnecter sur un poste partagé réassigne
 * l'abonnement au nouveau profil au lieu d'accumuler des destinataires.
 */
export async function subscribePushAction(
  input: PushSubscribeInput
): Promise<ActionResult<{ ok: boolean }>> {
  const parsed = pushSubscribeSchema.safeParse(input);
  if (!parsed.success) {
    return failure(firstZodMessage(parsed.error.issues), "INVALID_INPUT");
  }

  const profile = await getSessionProfile();
  if (!profile) {
    return failure("Votre session a expiré. Reconnectez-vous.", "UNAUTHENTICATED");
  }

  try {
    const supabase = await createAdminClient();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: profile.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
        origin: parsed.data.origin,
        user_agent: parsed.data.userAgent ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      logger.warn("push: enregistrement de l'abonnement impossible", { error: error.message });
      return failure("Impossible d'activer les notifications pour le moment.", "DB_ERROR");
    }

    return success({ ok: true });
  } catch (error) {
    logger.warn("push: enregistrement de l'abonnement impossible", { error });
    return failure("Impossible d'activer les notifications pour le moment.", "UNEXPECTED");
  }
}

/** Supprime l'abonnement du profil connecté (désactivation des notifications). */
export async function unsubscribePushAction(
  endpoint: string
): Promise<ActionResult<{ ok: boolean }>> {
  const parsed = pushUnsubscribeSchema.safeParse({ endpoint });
  if (!parsed.success) {
    return failure(firstZodMessage(parsed.error.issues), "INVALID_INPUT");
  }

  const profile = await getSessionProfile();
  if (!profile) {
    return failure("Votre session a expiré. Reconnectez-vous.", "UNAUTHENTICATED");
  }

  try {
    const supabase = await createAdminClient();
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", profile.id)
      .eq("endpoint", parsed.data.endpoint);

    if (error) {
      logger.warn("push: suppression de l'abonnement impossible", { error: error.message });
      return failure("Impossible de désactiver les notifications pour le moment.", "DB_ERROR");
    }

    return success({ ok: true });
  } catch (error) {
    logger.warn("push: suppression de l'abonnement impossible", { error });
    return failure("Impossible de désactiver les notifications pour le moment.", "UNEXPECTED");
  }
}
