import "server-only";

import { cache } from "react";
import { getSettings } from "@/lib/data/admin/settings";

/** Nom utilisé si `app_settings.company_name` est absent (installation vierge). */
export const FALLBACK_SITE_NAME = "ISF NAF-CHOPOP";

/**
 * Nom du site, lu depuis `app_settings.company_name` (admin : Paramètres).
 *
 * Mémoïsé par requête (React `cache`) : le layout racine l'appelle une fois
 * pour les métadonnées et une fois pour l'en-tête/pied de page.
 */
export const getSiteName = cache(async (): Promise<string> => {
  const settings = await getSettings();
  const name = settings.company_name?.trim();
  return name && name.length > 0 ? name : FALLBACK_SITE_NAME;
});

/** Branding public : couleurs et logo, consommés par le layout racine. */
export const getBranding = cache(async () => {
  const settings = await getSettings();
  return {
    brand_primary: settings.brand_primary,
    brand_secondary: settings.brand_secondary,
    brand_accent: settings.brand_accent,
    brand_logo_url: settings.brand_logo_url,
    site_tagline: settings.site_tagline,
  };
});
