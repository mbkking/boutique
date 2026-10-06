import "server-only";

import { safeQuery, toList } from "@/lib/data/safe";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "@/lib/validations/settings-schema";

/**
 * Lit les paramètres, en appliquant les defauts manquants.
 *
 * Cette lecture vit dans `lib/data` et non dans le fichier d'actions : le
 * composant client n'importe que l'action, et ne doit pas se voir trainer la
 * lecture serveur dans son bundle.
 */
export async function getSettings(): Promise<Settings> {
  const outcome = await safeQuery("settings.get", (supabase) =>
    supabase.from("app_settings").select("key, value").limit(200)
  );

  const rows = toList(outcome) as Array<{ key: string; value: string | null }>;
  if (rows.length === 0) return DEFAULT_SETTINGS;

  return parseSettings(rows);
}