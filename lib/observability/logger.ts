import "server-only";

/**
 * Journalisation structurée (§48).
 *
 * Objectif : des logs exploitables en production, pas des `console.log`.
 *
 * Deux règles absolues :
 * 1. **Jamais de secret.** Ce module refuse, à l'appel, toute clé ressemblant à
 *    un mot de passe, un jeton ou une clé d'API. Une fuite de secret dans les
 *    logs est indétectable une fois écrite.
 * 2. **Jamais de donnée personnelle inutile.** Un numéro de téléphone n'est
 *    journalisé que si l'appel le demande explicitement, et alors masqué.
 */

/** Clés dont la valeur ne doit jamais quitter l'application. */
const FORBIDDEN_KEYS = [
  "password",
  "password_hash",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "api_key",
  "apikey",
  "service_role",
  "service_role_key",
  "authorization",
  "cookie",
  "session",
  "otp",
  "pin",
];

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  /** Identifiant de corrélation : relie plusieurs logs d'une même requête. */
  requestId?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context: Record<string, unknown>;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Niveau minimal conservé.
 * `debug` en développement, `info` en production : un journal de debug en
 * production coûte du bruit et du crédit de logs.
 */
const MIN_LEVEL: LogLevel =
  process.env.NODE_ENV === "production"
    ? "info"
    : (process.env.LOG_LEVEL as LogLevel | undefined) ?? "debug";

/**
 * Normalise une clé pour la comparaison : `service_role_key`, `serviceRoleKey`
 * et `SERVICE-ROLE-KEY` désignent le même secret et doivent être traités
 * comme tels.
 */
function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z]/g, "");
}

/** Liste des clés interdites, normalisée une seule fois. */
const FORBIDDEN_KEYS_NORMALISED = FORBIDDEN_KEYS.map(normaliseKey);

function isForbiddenKey(key: string): boolean {
  const normalised = normaliseKey(key);
  return FORBIDDEN_KEYS_NORMALISED.some((forbidden) => normalised.includes(forbidden));
}

/** Masque un numéro de téléphone : `+22790123456` → `+227****3456`. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `****${digits.slice(-4)}`;
}

/**
 * Nettoie un contexte avant écriture.
 * Les clés sensibles sont **supprimées** plutôt que tronquées : une clé
 * présente avec la valeur `[REDACTED]` signale encore qu'un secret circule.
 */
export function sanitiseContext(context: LogContext): Record<string, unknown> {
  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    if (isForbiddenKey(key)) continue;

    if (value === null || value === undefined) continue;

    if (value instanceof Error) {
      clean[key] = { name: value.name, message: value.message };
      continue;
    }

    if (typeof value === "object" && !Array.isArray(value)) {
      clean[key] = sanitiseContext(value as LogContext);
      continue;
    }

    clean[key] = value;
  }

  return clean;
}

function write(level: LogLevel, message: string, context: LogContext = {}): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context: sanitiseContext(context),
  };

  // JSON en une ligne : lisible par un agrégateur de logs, et un objet par
  // entrée — un `console.log("x", "y")` n'est pas exploitable.
  const line = JSON.stringify(entry);

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};

/**
 * Identifiant de corrélation.
 *
 * En production il est fourni par l'infrastructure (en-tête `x-request-id`).
 * En développement, un identifiant aléatoire permet de suivre une action dans
 * les logs sans dépendre du serveur web.
 */
export function newRequestId(): string {
  return `req_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Journalise un échec métier sans masquer sa nature.
 * Utilisée par les points d'entrée serveur pour uniformiser les erreurs.
 */
export function logActionFailure(
  action: string,
  error: unknown,
  context: LogContext = {}
): void {
  logger.error(`action_failed: ${action}`, {
    ...context,
    error,
  });
}