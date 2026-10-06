import { z } from "zod";

/**
 * Thème visuel du back-office.
 *
 * Les valeurs sont stockées dans la table existante `app_settings`, sous le
 * préfixe `admin_theme_` : aucune nouvelle table, aucun nouveau système de
 * thème. Tout est validé ici, côté serveur, avant écriture.
 *
 * Le thème est ensuite traduit en variables CSS appliquées à la racine de
 * l'admin (`--admin-*`) et reporté sur les jetons Tailwind du design system
 * (`--color-surface`, `--color-border`...) : les composants existants
 * (Card, Button, Input, Badge) suivent ainsi sans être réécrits.
 */

/** Couleur hexadécimale à six chiffres, `#rrggbb`. */
const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Couleur attendue au format #rrggbb.");

/** URL d'image : soit vide, soit une URL absolue (bucket Supabase). */
const assetUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => value === "" || /^https:\/\//.test(value),
    "Adresse d'image invalide (une URL https est attendue)."
  );

export const adminThemeSchema = z
  .object({
    // Identité
    logo_url: assetUrl,

    // Arrière-plan
    background_mode: z.enum(["color", "image"]),
    background_color: hex,
    background_image_url: assetUrl,
    background_position: z.enum(["center", "top", "bottom", "left", "right"]),
    background_size: z.enum(["cover", "contain", "auto"]),
    background_repeat: z.enum(["no-repeat", "repeat", "repeat-x", "repeat-y"]),
    background_overlay_color: hex,
    background_overlay_opacity: z.coerce
      .number()
      .int("L'opacité doit être un nombre entier.")
      .min(0)
      .max(100),

    // Couleurs
    primary_color: hex,
    secondary_color: hex,
    accent_color: hex,
    link_color: hex,
    page_text_color: hex,
    muted_text_color: hex,

    // Cartes
    card_background_color: hex,
    card_border_color: hex,
    card_text_color: hex,
    card_title_color: hex,
    card_opacity: z.coerce.number().int().min(40).max(100),

    // Boutons
    button_background_color: hex,
    button_text_color: hex,
    button_hover_color: hex,

    // Champs de saisie
    input_background_color: hex,
    input_border_color: hex,

    // Badges
    badge_background_color: hex,
    badge_text_color: hex,
    badge_border_color: hex,

    // Forme
    border_style: z.enum(["none", "solid", "dashed", "dotted"]),
    border_width: z.coerce.number().int().min(0).max(4),
    border_radius: z.coerce.number().int().min(0).max(32),
    card_radius: z.coerce.number().int().min(0).max(48),
    card_shadow: z.enum(["none", "subtle", "medium", "strong"]),
  })
  // `strict` : une clé inconnue est une erreur, jamais une valeur ignorée.
  .strict();

export type AdminTheme = z.infer<typeof adminThemeSchema>;

/** Préfixe des clés dans `app_settings`. */
export const ADMIN_THEME_PREFIX = "admin_theme_";

/** Clés utilisées en base, déduites du schéma. */
export const ADMIN_THEME_KEYS = Object.keys(adminThemeSchema.shape) as Array<
  keyof AdminTheme
>;

/** Clé `app_settings` correspondant à un champ du thème. */
export function adminThemeStorageKey(field: keyof AdminTheme): string {
  return `${ADMIN_THEME_PREFIX}${field}`;
}

/** Valeurs par défaut : l'apparence actuelle du back-office. */
export const DEFAULT_ADMIN_THEME: AdminTheme = {
  logo_url: "",

  background_mode: "color",
  background_color: "#f9fafb",
  background_image_url: "",
  background_position: "center",
  background_size: "cover",
  background_repeat: "no-repeat",
  background_overlay_color: "#0f172a",
  background_overlay_opacity: 0,

  primary_color: "#1e2a2d",
  secondary_color: "#c6a15b",
  accent_color: "#35565c",
  link_color: "#1d4ed8",
  page_text_color: "#0f172a",
  muted_text_color: "#64748b",

  card_background_color: "#ffffff",
  card_border_color: "#e5e7eb",
  card_text_color: "#111827",
  card_title_color: "#111827",
  card_opacity: 100,

  button_background_color: "#1e2a2d",
  button_text_color: "#ffffff",
  button_hover_color: "#141d20",

  input_background_color: "#ffffff",
  input_border_color: "#d1d5db",

  badge_background_color: "#f3f4f6",
  badge_text_color: "#374151",
  badge_border_color: "#e5e7eb",

  border_style: "solid",
  border_width: 1,
  border_radius: 8,
  card_radius: 12,
  card_shadow: "subtle",
};

/** Formes proposées dans l'interface, en px. */
export const RADIUS_PRESETS = [
  { value: 0, label: "Carré" },
  { value: 4, label: "Légèrement arrondi" },
  { value: 8, label: "Arrondi" },
  { value: 12, label: "Bien arrondi" },
  { value: 16, label: "Très arrondi" },
  { value: 24, label: "Capsule douce" },
] as const;

/** Ombres disponibles. */
export const CARD_SHADOW_PRESETS = [
  { value: "none", label: "Aucune", css: "none" },
  { value: "subtle", label: "Légère", css: "0 1px 2px 0 rgb(0 0 0 / 0.06)" },
  { value: "medium", label: "Moyenne", css: "0 4px 12px -2px rgb(0 0 0 / 0.12)" },
  { value: "strong", label: "Forte", css: "0 12px 28px -8px rgb(0 0 0 / 0.22)" },
] as const;

/**
 * Convertit les lignes `app_settings` en thème.
 *
 * Une valeur absente ou invalide retombe sur le défaut : une ligne corrompue
 * ne doit jamais empêcher l'admin de s'afficher.
 */
export function parseAdminTheme(
  rows: ReadonlyArray<{ key: string; value: string | null }>
): AdminTheme {
  const stored: Record<string, unknown> = {};

  for (const field of ADMIN_THEME_KEYS) {
    const row = rows.find((entry) => entry.key === adminThemeStorageKey(field));
    if (row && row.value !== null && row.value !== undefined) {
      stored[field] = row.value;
    }
  }

  const parsed = adminThemeSchema.safeParse({ ...DEFAULT_ADMIN_THEME, ...stored });
  return parsed.success ? parsed.data : DEFAULT_ADMIN_THEME;
}

function withAlpha(hexColor: string, alphaPercent: number): string {
  const value = hexColor.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const a = Math.max(0, Math.min(100, alphaPercent)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function shadowCss(theme: AdminTheme): string {
  return (
    CARD_SHADOW_PRESETS.find((preset) => preset.value === theme.card_shadow)?.css ??
    CARD_SHADOW_PRESETS[1].css
  );
}

/** Position CSS équivalente à l'option choisie. */
function positionCss(position: AdminTheme["background_position"]): string {
  switch (position) {
    case "top":
      return "center top";
    case "bottom":
      return "center bottom";
    case "left":
      return "left center";
    case "right":
      return "right center";
    default:
      return "center center";
  }
}

/**
 * Variables CSS du thème.
 *
 * Deux familles sont produites :
 *   - `--admin-*` : le thème lui-même, utilisé par la couche de style scoped ;
 *   - les jetons du design system (`--color-surface`, `--color-border`...) :
 *     les composants partagés (Card, Button, Input, Badge) continuent de les
 *     utiliser et suivent donc le thème sans être réécrits.
 */
export function buildAdminThemeVariables(theme: AdminTheme): Record<string, string> {
  const cardSurface = withAlpha(theme.card_background_color, theme.card_opacity);
  const primarySoft = withAlpha(theme.primary_color, 10);

  return {
    // --admin-*
    "--admin-background": theme.background_color,
    "--admin-primary": theme.primary_color,
    "--admin-secondary": theme.secondary_color,
    "--admin-accent": theme.accent_color,
    "--admin-link": theme.link_color,
    "--admin-text": theme.page_text_color,
    "--admin-muted-text": theme.muted_text_color,
    "--admin-card-background": cardSurface,
    "--admin-card-border": theme.card_border_color,
    "--admin-card-text": theme.card_text_color,
    "--admin-card-title": theme.card_title_color,
    "--admin-card-radius": `${theme.card_radius}px`,
    "--admin-card-shadow": shadowCss(theme),
    "--admin-button-background": theme.button_background_color,
    "--admin-button-text": theme.button_text_color,
    "--admin-button-hover": theme.button_hover_color,
    "--admin-input-background": theme.input_background_color,
    "--admin-input-border": theme.input_border_color,
    "--admin-badge-background": theme.badge_background_color,
    "--admin-badge-text": theme.badge_text_color,
    "--admin-badge-border": theme.badge_border_color,
    "--admin-radius": `${theme.border_radius}px`,
    "--admin-border-style":
      theme.border_style === "none" || theme.border_width === 0
        ? "none"
        : theme.border_style,
    "--admin-border-width": theme.border_style === "none" ? "0px" : `${theme.border_width}px`,
    "--admin-primary-soft": primarySoft,

    // Jetons du design system, surchargés dans la portée de l'admin
    "--color-surface": cardSurface,
    "--color-surface-alt": withAlpha(theme.card_background_color, Math.min(60, theme.card_opacity)),
    "--color-border": theme.card_border_color,
    "--color-border-light": withAlpha(theme.card_border_color, 60),
    "--color-text": theme.card_text_color,
    "--color-text-muted": theme.muted_text_color,
    "--color-primary": theme.primary_color,
    "--color-primary-light": theme.accent_color,
    "--color-primary-dark": theme.button_hover_color,
    "--color-primary-50": primarySoft,
    "--color-secondary": theme.secondary_color,
    "--radius-sm": `${theme.border_radius}px`,
    "--radius-md": `${theme.border_radius}px`,
    "--radius-lg": `${theme.card_radius}px`,
    "--radius-xl": `${theme.card_radius}px`,
    "--shadow-sm": shadowCss(theme),
    "--shadow-md": shadowCss(theme),
    "--shadow-lg": shadowCss(theme),
    "--shadow-card": shadowCss(theme),
    "--shadow-card-hover": shadowCss(theme),
  };
}

/**
 * Style d'arrière-plan du conteneur racine : couleur, image, position, taille,
 * répétition et voile (overlay) superposé à l'image.
 */
export function buildAdminBackgroundStyle(theme: AdminTheme): {
  backgroundColor: string;
  backgroundImage?: string;
  backgroundPosition?: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
} {
  if (theme.background_mode !== "image" || theme.background_image_url === "") {
    return { backgroundColor: theme.background_color };
  }

  const layers: string[] = [];
  if (theme.background_overlay_opacity > 0) {
    layers.push(
      `linear-gradient(${withAlpha(theme.background_overlay_color, theme.background_overlay_opacity)}, ${withAlpha(theme.background_overlay_color, theme.background_overlay_opacity)})`
    );
  }
  layers.push(`url("${theme.background_image_url}")`);

  return {
    backgroundColor: theme.background_color,
    backgroundImage: layers.join(", "),
    backgroundPosition: positionCss(theme.background_position),
    backgroundSize:
      theme.background_size === "cover"
        ? "cover"
        : theme.background_size === "contain"
          ? "contain"
          : "auto",
    backgroundRepeat: theme.background_repeat,
  };
}

/** Contraste WCAG simplifié entre deux couleurs hex (1 → 21). */
export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hexColor: string): number => {
    const value = hexColor.replace("#", "");
    const channels = [0, 2, 4].map((offset) => {
      const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };

  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);

  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

/**
 * Avertissements de lisibilité.
 *
 * Aucun blocage : une administration peut être volontairement sobre. On
 * signale simplement les combinaisons qui nuisent au contraste.
 */
export function checkAdminThemeContrast(theme: AdminTheme): string[] {
  const warnings: string[] = [];

  if (contrastRatio(theme.page_text_color, theme.background_color) < 4.5) {
    warnings.push(
      "Contraste faible : le texte de la page sur le fond global peut être difficile à lire."
    );
  }
  if (contrastRatio(theme.card_text_color, theme.card_background_color) < 4.5) {
    warnings.push(
      "Contraste faible : le texte des cartes sur leur fond peut être difficile à lire."
    );
  }
  if (contrastRatio(theme.muted_text_color, theme.card_background_color) < 3) {
    warnings.push(
      "Contraste faible : le texte secondaire des cartes peut être difficile à lire."
    );
  }
  if (contrastRatio(theme.button_text_color, theme.button_background_color) < 3) {
    warnings.push(
      "Contraste faible : le texte des boutons sur leur fond peut être difficile à lire."
    );
  }
  if (contrastRatio(theme.badge_text_color, theme.badge_background_color) < 3) {
    warnings.push("Contraste faible : le texte des badges peut être difficile à lire.");
  }

  return warnings;
}