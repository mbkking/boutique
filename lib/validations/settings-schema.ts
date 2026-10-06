import { z } from "zod";

/**
 * Schéma des paramètres applicatifs.
 *
 * Chaque clé a un type déclaré ici, et non dans le formulaire : le serveur est
 * le seul juge de ce qu'il accepte. Un `app_settings` en clé/valeur libre
 * accepterait n'importe quoi, et une valeur mal typée casserait silencieusement
 * une règle de livraison ou un seuil de commande.
 *
 * Les valeurs sont stockées en texte ; c'est le schéma qui impose le typage au
 * moment de la lecture.
 */

/** Confirmation d'une commande : automatique, manuelle ou selon le montant. */
export const confirmationModeSchema = z.enum([
  "automatique",
  "manuelle",
  "hybride",
]);

export type ConfirmationMode = z.infer<typeof confirmationModeSchema>;

/** Adresse lisible, sans contrainte de format strict. */
const freeText = (max: number) => z.string().trim().max(max);

/**
 * Champs éditables par un administrateur.
 *
 * La liste est close : un champ non listé ici est refusé, ce qui évite qu'un
 * formulaire écrase une clé interne par erreur.
 */
export const settingsSchema = z.object({
  company_name: freeText(120),
  company_phone: freeText(40),
  company_email: z.string().trim().email("Adresse e-mail invalide").or(z.literal("")),
  company_address: freeText(240),
  company_hours: freeText(160),
  support_whatsapp: freeText(40),

  /** Montant en FCFA au-delà duquel la commande demande une confirmation. */
  high_value_threshold: z.coerce
    .number()
    .int("Le seuil doit être un nombre entier.")
    .min(0, "Le seuil ne peut pas être négatif.")
    .max(100_000_000, "Seuil hors limites."),

  confirmation_mode: confirmationModeSchema,

  /** Règles de livraison et politique COD, en texte libre. */
  cod_policy: freeText(1000),
  delivery_rules: freeText(1000),

  /** Canaux de notification activés, séparés par des virgules. */
  notifications_channels: z
    .string()
    .trim()
    .refine(
      (value) =>
        value
          .split(",")
          .map((entry) => entry.trim())
          .every((entry) => ["WEB", "EMAIL", "SMS", "PUSH"].includes(entry)),
      { message: "Canal de notification inconnu." }
    ),

  /** Affichage du nom court dans l'application installée. */
  pwa_short_name: freeText(24),
  pwa_theme_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur attendue au format #rrggbb."),
  pwa_background_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur attendue au format #rrggbb."),

  /**
   * Branding public : couleurs injectées dans les variables CSS du site et
   * logo affiché dans l'en-tête. L'URL du logo provient d'un upload validé
   * côt� serveur - jamais collée directement depuis le navigateur.
   */
  brand_primary: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur attendue au format #rrggbb."),
  brand_secondary: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur attendue au format #rrggbb."),
  brand_accent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur attendue au format #rrggbb."),
  brand_logo_url: freeText(500),
  site_tagline: freeText(160),

  seo_title: freeText(70),
  seo_description: freeText(180),

  legal_notice: freeText(2000),
  // `strict` : une clé inconnue est une erreur et non un champ silencieusement
  // retiré. Sans cela, une faute de frappe dans le formulaire disparaîtrait sans
  // trace et le réglage resterait à sa valeur par défaut sans explication.
}).strict();

export type Settings = z.infer<typeof settingsSchema>;

/** Clés acceptées par l'écriture, déduites du schéma. */
export const SETTINGS_KEYS = Object.keys(settingsSchema.shape) as Array<
  keyof Settings
>;

/** Libellés lisibles des clés techniques. */
export const SETTINGS_LABELS: Record<keyof Settings, string> = {
  company_name: "Nom de l'entreprise",
  company_phone: "Téléphone",
  company_email: "Adresse e-mail",
  company_address: "Adresse",
  company_hours: "Horaires d'ouverture",
  support_whatsapp: "Numéro WhatsApp",
  high_value_threshold: "Seuil de commande élevée",
  confirmation_mode: "Mode de confirmation des commandes",
  cod_policy: "Politique de paiement à la livraison",
  delivery_rules: "Règles de livraison",
  notifications_channels: "Canaux de notification",
  pwa_short_name: "Nom court (PWA)",
  pwa_theme_color: "Couleur principale (PWA)",
  pwa_background_color: "Couleur de fond (PWA)",
  brand_primary: "Couleur principale",
  brand_secondary: "Couleur secondaire",
  brand_accent: "Couleur d'accent",
  brand_logo_url: "Logo du site (URL)",
  site_tagline: "Slogan affich\u00e9 sous le nom",
  seo_title: "Titre SEO",
  seo_description: "Description SEO",
  legal_notice: "Mentions légales",
};

/**
 * Valeurs par défaut.
 *
 * Elles correspondent aux réglages du seed : un environnement vide doit
 * néanmoins démarrer avec des valeurs cohérentes.
 */
export const DEFAULT_SETTINGS: Settings = {
  company_name: "ISF NAF-CHOPOP",
  company_phone: "",
  company_email: "",
  company_address: "",
  company_hours: "",
  support_whatsapp: "",
  high_value_threshold: 100000,
  confirmation_mode: "hybride",
  cod_policy:
    "Paiement uniquement à la livraison, en espèces. Aucun paiement en ligne n'est disponible.",
  delivery_rules: "Livraison à Niamey et environs, du lundi au samedi.",
  notifications_channels: "WEB",
  pwa_short_name: "ISF NAF-CHOPOP",
  pwa_theme_color: "#1e2a2d",
  pwa_background_color: "#ffffff",
  brand_primary: "#1e2a2d",
  brand_secondary: "#c6a15b",
  brand_accent: "#35565c",
  brand_logo_url: "",
  site_tagline: "",
  seo_title: "ISF NAF-CHOPOP",
  seo_description:
    "Boutique en ligne à Niamey : accessoires, électronique et produits du quotidien, livrés à domicile.",
  legal_notice: "",
};

/**
 * Convertit une ligne `app_settings` en objet typé.
 *
 * Les clés inconnues sont ignorées et les valeurs invalides retombent sur le
 * défaut : une ligne corrompue ne doit pas empêcher l'affichage du reste.
 */
export function parseSettings(rows: ReadonlyArray<{ key: string; value: string | null }>): Settings {
  const collected: Record<string, string | null> = {};

  for (const row of rows) {
    if ((SETTINGS_KEYS as string[]).includes(row.key)) {
      collected[row.key] = row.value;
    }
  }

  const candidate = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const key of SETTINGS_KEYS) {
    const value = collected[key];
    if (value !== undefined && value !== null) candidate[key] = value;
  }

  const parsed = settingsSchema.safeParse(candidate);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}