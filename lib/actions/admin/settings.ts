"use server";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { logAuditEntry } from "@/lib/services/audit";
import { settingsSchema, SETTINGS_KEYS, type Settings } from "@/lib/validations/settings-schema";
import { createAdminClient } from "@/lib/supabase/server";
import {
  failure,
  firstZodMessage,
  success,
  type ActionResult,
} from "@/lib/actions/types";
import { logger } from "@/lib/observability/logger";

/**
 * Enregistre les paramètres.
 *
 * La validation porte sur le jeu complet transmis : un formulaire partiellement
 * rempli ne doit pas ecraser les autres cles avec des valeurs vides.
 * L'ecriture se fait par upsert, cle par cle.
 *
 * Ce fichier n'exporte que des actions : un composant client peut l'importer
 * sans entrainer la lecture serveur dans son bundle.
 */
export async function saveSettingsAction(
  payload: unknown
): Promise<ActionResult<Settings>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = settingsSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const settings = parsed.data;

  const supabase = await createAdminClient();

  const rows = SETTINGS_KEYS.map((key) => ({
    key,
    value: String(settings[key]),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });

  if (error) {
    logger.warn("settings: ecriture refusee", { error: error.message });
    return failure("Les parametres n'ont pas pu etre enregistres.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: "settings.update",
    entity_type: "app_settings",
    entity_id: "global",
    // On journalise les cles touchees, pas les valeurs : certaines sont des
    // mentions legales ou des coordonnees, qui n'ont pas leur place dans un log.
    after: { keys: SETTINGS_KEYS },
  });

  return success(settings);
}