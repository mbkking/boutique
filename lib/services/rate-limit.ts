import "server-only";

import { toSingle } from "@/lib/data/safe";
import { headers } from "next/headers";
import { logger } from "@/lib/observability/logger";

/**
 * Limitation de débit.
 *
 * Volontairement **adossée à la base** et non à la mémoire du processus : sous
 * un déploiement serverless, chaque requête peut être servie par une instance
 * différente, et un compteur en mémoire laisserait passer dix fois trop de
 * trafic. La base est le seul endroit où l'on peut compter juste.
 *
 * La fenêtre est **glissante** : elle est ré-calculée à chaque appel à partir de
 * l'historique conservé. Une fenêtre fixe (« 10 par minute ») permettrait de
 * contourner la limite en envoyant 10 requêtes en fin de fenêtre puis 10 autres
 * juste après le basculement.
 *
 * Le comptage est fait en base dans une seule instruction, sous verrou, pour
 * que deux requêtes simultanées ne franchissent pas la limite à la fois.
 */

export interface RateLimitRule {
  /** Identifiant de la règle, sert de préfixe de clé de stockage. */
  name: string;
  /** Nombre de requêtes autorisées par fenêtre. */
  limit: number;
  /** Durée de la fenêtre, en secondes. */
  windowSeconds: number;
}

/** Une décision de limitation. */
export interface RateLimitResult {
  allowed: boolean;
  /** Nombre de requêtes déjà consommées dans la fenêtre courante. */
  current: number;
  limit: number;
  /** Secondes restantes avant réinitialisation, pour l'en-tête `Retry-After`. */
  retryAfterSeconds: number;
}

interface CountRow {
  request_count: number | string;
  window_started_at: string;
}

/**
 * Clé d'identification de l'appelant.
 *
 * On privilégie l'adresse IP. Derrière un proxy, `x-forwarded-for` contient la
 * première valeur, qui est le client d'origine et non le proxy — prendre la
 * dernière feraitering de tous les clients derrière la même adresse.
 */
export async function getClientIp(): Promise<string> {
  const headerList = await headers();

  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return (
    headerList.get("x-real-ip") ??
    headerList.get("cf-connecting-ip") ??
    "unknown"
  );
}

/**
 * Consomme un jeton pour la règle donnée.
 *
 * Renvoie `allowed: false` sans rien écrire si la limite est déjà atteinte :
 * cela évite qu'un attaquant ne fasse grossir indéfiniment la table.
 */
export async function consumeRateLimit(
  rule: RateLimitRule,
  identifier: string
): Promise<RateLimitResult> {
  const client = await getSupabase();
  if (!client) {
    // Sans base, on laisse passer plutôt que de bloquer toute la boutique.
    // La règle est un garde-fou, pas une condition de fonctionnement.
    return { allowed: true, current: 0, limit: rule.limit, retryAfterSeconds: 0 };
  }

  const key = `${rule.name}:${identifier}`;
  const windowSeconds = rule.windowSeconds;

  const { data, error } = (await client.rpc("rate_limit_hit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_limit: rule.limit,
  })) as { data: unknown; error: { message: string } | null };

  if (error) {
    logger.warn("rate-limit: appel refuse", { error: error.message, key });
    return { allowed: true, current: 0, limit: rule.limit, retryAfterSeconds: 0 };
  }

  const row = toSingle({
    data: (data ?? null) as CountRow[] | null,
    error: null,
    count: null,
  }) as CountRow | null;
  const current = Number(row?.request_count ?? 0);
  const startedAt = row?.window_started_at ? new Date(row.window_started_at) : new Date();

  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - startedAt.getTime()) / 1000)
  );
  const retryAfterSeconds = Math.max(0, windowSeconds - elapsedSeconds);

  return {
    allowed: current <= rule.limit,
    current,
    limit: rule.limit,
    retryAfterSeconds,
  };
}

/** Règles appliquées à l'application. */
export const RATE_LIMITS = {
  /** Création de commande par un client non connecté. */
  guestCheckout: { name: "guest_checkout", limit: 5, windowSeconds: 3600 },
  /** Validation d'un code promo. */
  couponValidation: { name: "coupon_validation", limit: 20, windowSeconds: 300 },
  /** Connexion : limite les tentatives par IP, sans viser un compte précis. */
  signIn: { name: "sign_in", limit: 10, windowSeconds: 900 },
  /** Création de compte. */
  signUp: { name: "sign_up", limit: 3, windowSeconds: 3600 },
  /** Contact / toute soumission de formulaire publique. */
  publicForm: { name: "public_form", limit: 5, windowSeconds: 3600 },
  /** Relecture du panier, très sollicité mais non métier. */
  cartReconcile: { name: "cart_reconcile", limit: 60, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

async function getSupabase() {
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    return await createAdminClient();
  } catch {
    return null;
  }
}