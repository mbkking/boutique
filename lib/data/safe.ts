import "server-only";

import { createAdminClient, type SupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Résultat normalisé d'une lecture base de données.
 * `data` vaut `null` dès que la base est injoignable ou que la requête échoue.
 */
export interface QueryOutcome<T> {
  data: T | null;
  error: string | null;
  /**
   * Nombre total de lignes correspondant au filtre, lorsqu'il a été demandé
   * via `{ count: "exact" }`. `null` sinon : on ne devine pas.
   */
  count: number | null;
}

interface RawResult<T> {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Exécute une lecture Supabase en mode dégradé (EXIGENCE §dégradation gracieuse).
 *
 * - Variables d'environnement manquantes : warning + `data: null`.
 * - Base injoignable / erreur réseau : warning + `data: null`.
 * - Aucune exception ne remonte jamais vers le rendu d'une page.
 *
 * Le client privilégié (service role) est utilisé car les lectures publiques du
 * catalogue et le suivi de commande par numéro ne doivent pas dépendre du client
 * anonyme ni de l'état de session.
 */
export async function safeQuery<T>(
  label: string,
  run: (supabase: SupabaseAdminClient) => PromiseLike<RawResult<T>>
): Promise<QueryOutcome<T>> {
  let supabase: SupabaseAdminClient;

  try {
    supabase = await createAdminClient();
  } catch (error) {
    console.warn(
      `[data:${label}] configuration Supabase indisponible, retour d'une liste vide.`,
      describe(error)
    );
    return { data: null, error: describe(error), count: null };
  }

  try {
    const result = await run(supabase);
    if (result.error) {
      console.warn(`[data:${label}] requête en échec : ${result.error.message}`);
      return { data: null, error: result.error.message, count: null };
    }
    return {
      data: result.data,
      error: null,
      count: typeof result.count === "number" ? result.count : null,
    };
  } catch (error) {
    console.warn(`[data:${label}] exception lors de la lecture :`, describe(error));
    return { data: null, error: describe(error), count: null };
  }
}

/** Retourne toujours un tableau, même si la lecture a échoué. */
export function toList<T>(outcome: QueryOutcome<T[]>): T[] {
  return Array.isArray(outcome.data) ? outcome.data : [];
}

/** Retourne toujours `null` si la lecture a échoué ou si la ligne est absente. */
export function toSingle<T>(outcome: QueryOutcome<T[]>): T | null {
  const rows = outcome.data;
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * Les assainisseurs vivent dans `lib/data/sanitize.ts` : ce module est
 * utilisable côté client, alors que le présent fichier est réservé au serveur.
 */
export {
  sanitizeSearchTerm,
  buildLikePatterns,
  buildSearchTermGroups,
  sanitizeSlug,
} from "@/lib/data/sanitize";