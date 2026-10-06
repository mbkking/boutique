import "server-only";

import { cache } from "react";
import { safeQuery, toList } from "@/lib/data/safe";
import {
  ADMIN_THEME_PREFIX,
  parseAdminTheme,
  type AdminTheme,
} from "@/lib/theme/admin-theme";

/**
 * Thème du back-office, lu depuis `app_settings`.
 *
 * Une seule requête pour l'ensemble des clés `admin_theme_*`. En cas d'échec ou
 * d'absence de données, le thème par défaut est renvoyé : le back-office ne
 * doit jamais être bloqué par une préférences d'affichage.
 */
export const getAdminTheme = cache(async (): Promise<AdminTheme> => {
  const outcome = await safeQuery("adminTheme.get", (supabase) =>
    supabase
      .from("app_settings")
      .select("key, value")
      .like("key", `${ADMIN_THEME_PREFIX}%`)
      .limit(100)
  );

  return parseAdminTheme(toList(outcome));
});