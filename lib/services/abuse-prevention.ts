import "server-only";

import { safeQuery, toList } from "@/lib/data/safe";
import { logger } from "@/lib/observability/logger";
import type { SupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Détection d'abus sur le paiement à la livraison (§46).
 *
 * Le COD est le seul moyen de paiement du MVP : c'est donc aussi le seul vecteur
 * d'abus. Un client peut enchaîner des commandes puis ne pas encaisser.
 *
 * Principe directeur : **jamais de blocage définitif sur un seul signal**.
 * Un score produit une *revue manuelle*, pas un refus. Refuser une commande sur
 * la base d'un indice isolé reviendrait à punir un client de bonne foi qui
 * commande souvent, ou qui a changé de numéro.
 *
 * Chaque décision est journalisée avec ses motifs : un arbitrage doit pouvoir
 * être expliqué et corrigé.
 */

export interface AbuseSignal {
  /** Identifiant technique du signal. */
  code: string;
  /** Description lisible, affichable à l'administrateur. */
  label: string;
  /** Points de suspicion apportés par ce signal. */
  weight: number;
}

export interface AbuseAssessmentInput {
  subjectId?: string | null;
  phone: string;
  /**
   * Ordre de grandeur de la commande. Quand l'appelant ne dispose pas encore
   * du prix définitif (prix recalculé par le serveur plus loin), il transmet
   * le nombre d'articles demandés : le signal reste pertinent, et c'est le
   * nombre de commandes et d'échecs qui porte réellement la décision.
   */
  amount: number;
}

export interface AbuseAssessment {
  /** Identité technique du profil évalué, ou du téléphone. */
  subject: string;
  score: number;
  signals: AbuseSignal[];
  /** `auto` : proceeds normally. `review` : manual confirmation required. */
  decision: "auto" | "review";
  /** Rappel de l'action attendue, non bloquante. */
  reason: string | null;
}

/** Réglages. Volontairement larges : ils abaissent le risque de faux positif. */
export interface AbuseThresholds {
  /** Nombre de commandes non livrées au-delà duquel on suspecte un abus. */
  maxUndeliveredOrders: number;
  /** Nombre d'échecs de livraison récents au-delà duquel on suspecte un abus. */
  maxFailedDeliveries: number;
  /** Montant des commandes impayées au-delà duquel on demande une confirmation manuelle. */
  maxOutstandingAmount: number;
  /** Score à partir duquel une confirmation manuelle est demandée. */
  reviewScore: number;
  /** Au-delà de ce score, le dossier est signalé à l'administrateur. */
  blockScore: number;
}

export const DEFAULT_ABUSE_THRESHOLDS: AbuseThresholds = {
  maxUndeliveredOrders: 3,
  maxFailedDeliveries: 3,
  maxOutstandingAmount: 150_000,
  reviewScore: 4,
  blockScore: 10,
};

/** Commandes non livrées (statuts non terminaux) pour un sujet donné. */
async function countUndeliveredOrders(
  supabase: SupabaseAdminClient,
  profileId: string | null,
  phone: string
): Promise<number> {
  const outcome = await safeQuery("abuse.undelivered", (client) => {
    let builder = client
      .from("orders")
      .select("id", { count: "exact", head: true })
      .not("status", "in", "(DELIVERED,CANCELLED,RETURNED)");

    if (profileId) {
      builder = builder.eq("customer_id", profileId);
    } else {
      // Sans compte : le numéro de l'instantané d'adresse fait foi.
      builder = builder.eq("address_snapshot->>phone", phone);
    }

    return builder;
  });

  return outcome.count ?? 0;
}

/**
 * Livraisons en échec pour un sujet donné.
 *
 * Sans compte client, on ne peut pas compter par livreur : on remonte alors
 * les échecs des commandes passées avec ce numéro. Compter à l'échelle de
 * l'entreprise serait un faux signal — un incident isolé chez un livreur
 * ferait Flag tout client invité.
 */
async function countFailedDeliveries(
  supabase: SupabaseAdminClient,
  profileId: string | null,
  phone: string
): Promise<number> {
  if (!profileId) {
    const outcome = await safeQuery("abuse.failedDeliveriesByPhone", (client) =>
      client
        .from("deliveries")
        // PostgREST refuse un filtre sur une relation absente du select :
        // `orders!inner` la référence tout en filtrant les livraisons.
        .select("id, orders!inner(id)", { count: "exact", head: true })
        .eq("status", "FAILED")
        .eq(
          "orders.address_snapshot->>phone",
          phone
        )
    );

    return outcome.count ?? 0;
  }

  const outcome = await safeQuery("abuse.failedDeliveriesByCustomer", (client) =>
    client
      .from("deliveries")
      .select("id, orders!inner(id)", { count: "exact", head: true })
      .eq("status", "FAILED")
      .eq("orders.address_snapshot->>phone", phone)
      .limit(1)
  );

  return outcome.count ?? 0;
}

/** Montant total restant dû sur les commandes non soldées. */
async function sumOutstandingAmount(
  supabase: SupabaseAdminClient,
  profileId: string | null,
  phone: string
): Promise<number> {
  const outcome = await safeQuery("abuse.outstanding", (client) => {
    let builder = client
      .from("orders")
      .select("total")
      .in("payment_status", ["COD_PENDING", "COD_PARTIAL"])
      .not("status", "in", "(CANCELLED,RETURNED)");

    if (profileId) {
      builder = builder.eq("customer_id", profileId);
    } else {
      builder = builder.eq("address_snapshot->>phone", phone);
    }

    return builder.limit(200);
  });

  let total = 0;
  for (const row of toList(outcome)) {
    if (typeof row.total === "number") total += row.total;
  }

  return total;
}

/**
 * Évalue le risque associé à une nouvelle commande.
 *
 * `subjectId` est l'identifiant de la fiche client s'il existe ; sinon le
 * numéro de téléphone est utilisé. Les commandes invité étant majoritaires au
 * MVP, l'analyse ne peut pas reposer sur le seul compte.
 */
export async function assessCodRisk(
  supabase: SupabaseAdminClient,
  input: AbuseAssessmentInput,
  thresholds: AbuseThresholds = DEFAULT_ABUSE_THRESHOLDS
): Promise<AbuseAssessment> {
  const subjectId = input.subjectId ?? null;
  const phone = input.phone;

  const [undelivered, failed, outstanding] = await Promise.all([
    countUndeliveredOrders(supabase, subjectId, phone),
    countFailedDeliveries(supabase, subjectId, phone),
    sumOutstandingAmount(supabase, subjectId, phone),
  ]);

  const signals: AbuseSignal[] = [];

  if (undelivered > thresholds.maxUndeliveredOrders) {
    signals.push({
      code: "MANY_UNDELIVERED_ORDERS",
      label: `${undelivered} commandes non livrées`,
      weight: 3,
    });
  }

  if (failed > thresholds.maxFailedDeliveries) {
    signals.push({
      code: "MANY_FAILED_DELIVERIES",
      label: `${failed} livraisons échouées`,
      weight: 2,
    });
  }

  if (outstanding > thresholds.maxOutstandingAmount) {
    signals.push({
      code: "HIGH_OUTSTANDING_AMOUNT",
      label: `${outstanding.toLocaleString("fr-FR")} XOF restant dû`,
      weight: 3,
    });
  }

  // Une commande de valeur élevée peut être légitime : un signal isolé ne
  // suffit jamais à bloquer, et son poids reste faible.
  if (input.amount >= thresholds.maxOutstandingAmount * 2) {
    signals.push({
      code: "HIGH_VALUE_ORDER",
      label: `Commande de ${input.amount.toLocaleString("fr-FR")} XOF`,
      weight: 1,
    });
  }

  const score = signals.reduce((sum, signal) => sum + signal.weight, 0);

  // Règle explicite : `block` n'existe pas ici. Le pire qui arrive est une
  // confirmation manuelle renforcée, réversible par un humain.
  const decision: AbuseAssessment["decision"] =
    score >= thresholds.reviewScore ? "review" : "auto";

  const assessment: AbuseAssessment = {
    subject: subjectId ?? `phone:${phone.slice(-4)}`,
    score,
    signals,
    decision,
    reason:
      decision === "review"
        ? "Confirmation manuelle recommandée avant expédition : plusieurs signaux cumulés."
        : null,
  };

  if (decision === "review") {
    logger.warn("cod: confirmation manuelle recommandée", {
      subject: assessment.subject,
      score,
      signals: signals.map((signal) => signal.code),
    });
  }

  return assessment;
}

/**
 * Seuils persistés dans les paramètres applicatifs, avec repli sur les
 * valeurs par défaut. Un réglage absent ou invalide ne bloque jamais le
 * service : la commande est simplement évaluée avec les seuils par défaut.
 */
export async function loadAbuseThresholds(): Promise<AbuseThresholds> {
  const outcome = await safeQuery("abuse.thresholds", (client) =>
    client
      .from("app_settings")
      .select("key, value")
      .like("key", "cod_%")
      .limit(20)
  );

  const rows = toList(outcome);
  const read = (key: string): number | null => {
    const row = rows.find((entry) => entry.key === key);
    if (!row) return null;
    const value = Number(row.value);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };

  return {
    maxUndeliveredOrders:
      read("cod_max_undelivered_orders") ?? DEFAULT_ABUSE_THRESHOLDS.maxUndeliveredOrders,
    maxFailedDeliveries:
      read("cod_max_failed_deliveries") ?? DEFAULT_ABUSE_THRESHOLDS.maxFailedDeliveries,
    maxOutstandingAmount:
      read("cod_max_outstanding_amount") ?? DEFAULT_ABUSE_THRESHOLDS.maxOutstandingAmount,
    reviewScore: read("cod_review_score") ?? DEFAULT_ABUSE_THRESHOLDS.reviewScore,
    blockScore: read("cod_block_score") ?? DEFAULT_ABUSE_THRESHOLDS.blockScore,
  };
}