import "server-only";

import { headers } from "next/headers";
import { logger } from "@/lib/observability/logger";
import { getClientIp, consumeRateLimit, RATE_LIMITS, type RateLimitRule } from "@/lib/services/rate-limit";
import { failure, success, type ActionResult } from "@/lib/actions/types";

/**
 * Protection anti-robot du checkout invité.
 *
 * Trois barrières de difficulté croissante, pour que le coût d'un faux positif
 * soit nul :
 *
 * 1. **Piège à miel** (champ masqué) : un robot qui remplit tous les champs
 *    se signale. Un humain ne le voit pas, donc ne le remplit jamais.
 * 2. **Temps de saisie minimal** : le checkout demande un nom, un téléphone et
 *    une adresse. Remplir le tout en moins de deux secondes n'est pas humain.
 * 3. **CAPTCHA** (Cloudflare Turnstile), uniquement si une clé publique est
 *    configurée.
 *
 * La troisième barrière est facultative **délibérément**, et tolère la panne :
 * sans clé, ou si Cloudflare ne répond pas, le checkout reste utilisable pour
 * un vrai client dans un pays où la connectivité est irrégulière, protégé par
 * les deux premières. Bloquer tout le tunnel sur une panne de tiers est un motif
 * classique d'abandon en commande. Seul un jeton *explicitement refusé* bloque.
 */
export interface CaptchaVerdict {
  /** Le formulaire peut être traité. */
  ok: boolean;
  /** Raison du refus, destinée aux journaux et au message d'erreur. */
  reason:
    | "OK"
    | "HONEYPOT"
    | "TOO_FAST"
    | "TOO_SLOW"
    | "MISSING_TOKEN"
    | "INVALID_TOKEN"
    | "RATE_LIMITED";
}

export interface GuestGuardInput {
  /** Valeur du champ piège à miel. Doit être vide. */
  honeypot: string | null | undefined;
  /** Instant d'ouverture du formulaire, en millisecondes (`Date.now()`). */
  startedAt: number;
  /** Jeton Turnstile fourni par le widget, s'il y en a un. */
  captchaToken?: string | null;
  /** Règle de limitation appliquée au checkout invité. */
  rule?: RateLimitRule;
}

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Délai minimal pour remplir le formulaire, en millisecondes.
 *
 * Le seuil est bas exprès : il ne cherche pas à mesurer la vitesse de frappe
 * réelle, seulement à distinguer un humain d'un script qui poste sans lire la
 * page. Deux secondes sont largement accordées à une saisie clavier normale,
 * même sur un téléphone d'entrée de gamme avec une saisie prédictive.
 */
export const MIN_FILL_MS = 2000;

/**
 * Âge maximal crédible du formulaire, en millisecondes.
 *
 * Cette borne ferme un contournement : l'horodatage vient du navigateur, et
 * envoyer `form_started_at: 0` produirait un délai de plusieurs dizaines
 * d'années — supérieur à toute borne basse, donc « acceptable ». Sans plafond,
 * la barrière s'annulait d'elle-même.
 *
 * Deux heures laisse le temps de remplir le formulaire sur une connexion lente,
 * de chercher une adresse, puis de commander. Au-delà, la page est considérée
 * comme périmée.
 */
export const MAX_FILL_MS = 2 * 60 * 60 * 1000;

/** Durée de validité d'une vérification Turnstile. */
const TURNSTILE_TIMEOUT_MS = 5000;

/**
 * Décide, sans effet de bord, si les signaux basics autorisent la poursuite.
 *
 * Isolé de `guardGuestCheckout` pour être testable directement : les deux
 * barrières locales ne dépendent ni de la base ni du réseau.
 *
 * Un horodatage absent ou incohérent est traité comme un échec plutôt que
 * comme une absence de signal : on ne fait pas confiance à une valeur venue du
 * navigateur. La borne haute referme le contournement par `form_started_at: 0`.
 */
export function evaluateClientSignals(input: {
  honeypot: string | null | undefined;
  elapsedMs: number;
}): { ok: true } | { ok: false; reason: CaptchaVerdict["reason"] } {
  if (input.honeypot && input.honeypot.trim() !== "") {
    return { ok: false, reason: "HONEYPOT" };
  }

  // Les deux bornes se distinguent, parce que le motif doit permettre de
  // diagnostiquer : un délai trop court signale une soumission automatique, un
  // délai trop long signale un horodatage falsifié ou un formulaire laissé
  // ouvert. Les confondre rendrait le journal inexploitable.
  const { elapsedMs } = input;
  if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_FILL_MS) {
    return { ok: false, reason: "TOO_FAST" };
  }

  if (elapsedMs > MAX_FILL_MS) {
    return { ok: false, reason: "TOO_SLOW" };
  }

  return { ok: true };
}

export function isCaptchaConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
      process.env.TURNSTILE_SECRET_KEY
  );
}

/** Clé publique de Turnstile, ou chaîne vide quand le widget n'est pas rendu. */
export function getCaptchaSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
}

/**
 * Issue d'une vérification Turnstile.
 *
 * La distinction entre « refus » et « indisponible » est la seule chose qui
 * permette de décider correctement. Un jeton refusé est la signature d'un robot
 * et doit bloquer. Un service qui ne répond pas est notre panne : bloquer le
 * tunnel d'achat sur une panne de tiers coûterait des ventes pour rien, et
 * laisser passer ne coûte que l'absence de protection CAPTCHA — que la
 * limitation de débit et le piège à miel continuent d'assurer.
 */
export type TurnstileOutcome = "valid" | "invalid" | "unavailable";

/**
 * Vérifie le jeton Turnstile auprès de Cloudflare.
 *
 * Exporté pour les tests : c'est la fonction qui décide entre les trois issues,
 * et la seule partie de ce module qui dépende du réseau.
 */
export async function verifyTurnstile(
  token: string,
  ip: string
): Promise<TurnstileOutcome> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return "unavailable";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 4xx : notre requête est mauvaise, le service est joignable.
      // 5xx : le service est en panne. Dans les deux cas, ce n'est pas le
      // client qui est fautif, et bloquer serait injustifié.
      logger.warn("captcha: verification refusee", { status: response.status });
      return "unavailable";
    }

    const payload = (await response.json()) as { success?: boolean };
    return payload.success === true ? "valid" : "invalid";
  } catch (error) {
    logger.warn("captcha: verification impossible", {
      error: error instanceof Error ? error.message : "inconnue",
    });
    return "unavailable";
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Applique les quatre barrières à une soumission de commande invité.
 *
 * L'ordre est volontairement du moins cher au plus cher : le piège à miel et la
 * mesure du temps ne coûtent aucun appel, et éliminent la majorité des robots
 * avant d'interroger la base ou le service de vérification.
 */
export async function guardGuestCheckout(
  input: GuestGuardInput
): Promise<ActionResult<CaptchaVerdict>> {
  // 1 et 2. Piège à miel, puis temps de saisie.
  const signals = evaluateClientSignals({
    honeypot: input.honeypot,
    elapsedMs: Date.now() - input.startedAt,
  });

  if (!signals.ok) {
    logger.warn("checkout: signal anti-robot rejete", { reason: signals.reason });
    return failure("Requête rejetée.", signals.reason);
  }

  // 3. Limitation de débit, placée après les deux premières barrières : inutile
  //   d'aller interroger la base pour une requête déjà rejetée.
  const ip = await getClientIp();
  const limit = await consumeRateLimit(input.rule ?? RATE_LIMITS.guestCheckout, ip);

  if (!limit.allowed) {
    logger.warn("checkout: limite de debit atteinte", {
      current: limit.current,
      limit: limit.limit,
    });
    return failure(
      "Trop de commandes enregistrées depuis ce réseau. Réessayez dans quelques minutes.",
      "RATE_LIMITED"
    );
  }

  // 4. CAPTCHA, seulement si configuré.
  //
  // Un jeton absent signifie que le widget n'a pas rendu — script bloqué,
  // extension, réseau dégradé. Traiter cela comme un refus punit un client réel ;
  // le laisser passer ne supprime que la protection CAPTCHA, pas les trois
  // autres. L'indisponibilité est donc tolérée, jamais un refus.
  if (isCaptchaConfigured()) {
    if (!input.captchaToken) {
      logger.warn("captcha: jeton absent, verification ignoree");
    } else {
      const outcome = await verifyTurnstile(input.captchaToken, ip);

      if (outcome === "invalid") {
        return failure("Vérification anti-robot invalide.", "INVALID_TOKEN");
      }

      if (outcome === "unavailable") {
        logger.warn("captcha: service indisponible, commande acceptee sous reserve");
      }
    }
  }

  return success({ ok: true, reason: "OK" });
}

/**
 * En-têtes standards à renvoyer avec un refus de limitation.
 *
 * Sans `Retry-After`, un client qui reçoit un refus ne sait pas quand
 * réessayer et revient immédiatement, ce qui entretient la surcharge.
 */
export function rateLimitHeaders(limit: {
  limit: number;
  current: number;
  retryAfterSeconds: number;
}): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit.limit),
    "X-RateLimit-Remaining": String(Math.max(0, limit.limit - limit.current)),
    "X-RateLimit-Reset": String(limit.retryAfterSeconds),
    ...(limit.retryAfterSeconds > 0
      ? { "Retry-After": String(limit.retryAfterSeconds) }
      : {}),
  };
}

/** User-Agent, utile au journal : distingue un navigateur d'un script. */
export async function describeClient(): Promise<string> {
  const headerList = await headers();
  return headerList.get("user-agent") ?? "inconnu";
}