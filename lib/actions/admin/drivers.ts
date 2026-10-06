"use server";

import { z } from "zod";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { logAuditEntry } from "@/lib/services/audit";
import { createAdminClient } from "@/lib/supabase/server";
import { phoneSchema } from "@/lib/validations/schemas";
import {
  failure,
  firstZodMessage,
  success,
  type ActionResult,
} from "@/lib/actions/types";
import { logger } from "@/lib/observability/logger";

/**
 * Invitation d'un livreur.
 *
 * La création d'un compte passe par l'API d'administration Supabase, qui n'est
 * accessible qu'avec la clé de service — donc uniquement ici, côté serveur. Le
 * navigateur n'a aucun moyen de créer un compte ni d'attribuer un rôle.
 *
 * Le rôle n'est jamais pris dans les métadonnées fournies par l'appelant. Le
 * trigger `handle_new_user` force `customer` à l'inscription, précisément pour
 * qu'une inscription ne puisse pas s'auto-attribuer un rôle privilégié ; c'est
 * cette action, exécutée par un administrateur, qui elevate ensuite le compte
 * en `driver`.
 */

const inviteDriverSchema = z.object({
  full_name: z.string().trim().min(2, "Le nom du livreur est requis").max(120),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(254),
  phone: phoneSchema,
});

export async function inviteDriverAction(
  payload: unknown
): Promise<ActionResult<{ email: string; invited: boolean }>> {
  const auth = await requirePermission(PERMISSIONS.USER_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = inviteDriverSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const { full_name, email, phone } = parsed.data;
  const supabase = await createAdminClient();

  // Aucun contrôle préalable des doublons.
  //
  // Une version de cette action interrogeait `listUsers` avant d'inviter, pour
  // refuser un compte déjà existant. Ce contrôle ne tenait pas : il ne lisait
  // que la première page de mille utilisateurs, donc il manquait les doublons
  // au-delà — en donnant l'illusion d'une vérification. Et il coûtait une
  // requête complète à chaque tentative.
  //
  // L'invitation elle-même fait autorité : l'API d'authentification refuse un
  // doublon sans envoyer de message. Il suffit donc de reconnaître son erreur,
  // ce que le bloc suivant fait.

  /**
   * L'invitation est tentée d'abord : le livreur reçoit un lien qui fixe son
   * mot de passe, sans que personne n'ait à lui en communiquer un.
   *
   * Si l'envoi échoue — SMTP non configuré sur le projet, quota atteint — le
   * compte n'est **pas** créé quand même. Créer un compte sans moyen de le
   * activer produirait un livreur qui ne peut pas se connecter et que
   * l'administrateur croirait actif.
   */
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    email,
    {
      data: { full_name, phone },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/connexion`,
    }
  );

  if (inviteError || !invited?.user) {
    const detail = (inviteError?.message ?? "").toLowerCase();

    // Les formulations ont changé au fil des versions de l'API ; les couvrir
    // toutes évite de renvoyer un message technique à l'administrateur.
    const isDuplicate = detail.includes("already been registered")
      || detail.includes("already registered")
      || detail.includes("user already exists");

    logger.warn("drivers: invitation refusee", {
      error: inviteError?.message,
      duplicate: isDuplicate,
    });

    if (isDuplicate) {
      return failure(
        "Un compte existe deja avec cette adresse. Modifiez son role depuis la gestion des utilisateurs."
      );
    }

    return failure(
      inviteError?.message?.includes("rate limit")
        || detail.includes("too many")
        ? "Trop de demandes envoyees d'affilee. Reessayez dans quelques minutes."
        : "L'invitation n'a pas pu etre envoyee. Verifiez la configuration e-mail du projet Supabase."
    );
  }

  // Le rôle n'est écrit qu'après création réussie, et jamais à partir d'une
  // valeur venue du navigateur.
  const { error: roleError } = await supabase
    .from("profiles")
    .update({ role: "driver", phone, full_name, updated_at: new Date().toISOString() })
    .eq("id", invited.user.id);

  if (roleError) {
    // Compte créé mais sans rôle : le laisser ainsi produirait un compte
    // « client » invisible du côté livreurs. L'erreur est remontée telle quelle
    // pour que l'administrateur intervienne, et journalisée.
    logger.error("drivers: role non applique apres invitation", {
      user_id: invited.user.id,
      error: roleError.message,
    });

    return failure(
      "Le compte a ete cree mais le role livreur n'a pas pu etre applique. Verifiez le profil du compte avant de reessayer."
    );
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: "user.invite_driver",
    entity_type: "profiles",
    entity_id: invited.user.id,
    // L'adresse e-mail d'un livreur est une donnée personnelle : elle est
    // utile dans la trace mais n'a pas sa place dans un journalisation libre.
    after: { role: "driver", invited: true },
  });

  return success({ email, invited: true });
}