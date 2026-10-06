/** Types de retour communs aux server actions. */

export interface ActionFailure {
  success: false;
  error: string;
  /**
   * Code technique, stable, utile aux journaux et au traitement côté client.
   * Volontairement absent de l'affichage : un internaute n'a rien à faire de
   * `RATE_LIMITED`.
   */
  code?: string;
}

export type ActionResult<T> = ({ success: true } & T) | ActionFailure;

export function failure(error: string, code?: string): ActionFailure {
  return code === undefined ? { success: false, error } : { success: false, error, code };
}

export function success<T extends object>(payload: T): { success: true } & T {
  return { success: true, ...payload };
}

/** Extrait le premier message utilisateur d'une erreur Zod (français). */
export function firstZodMessage(issues: readonly { message: string }[]): string {
  const first = issues[0];
  return first && first.message ? first.message : "Les informations saisies sont invalides.";
}

/** Traduit une erreur technique en message français affichable. */
export function toUserMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    // Les erreurs de configuration remontent un message déjà en français.
    if (error.message.includes("Variable d'environnement manquante")) return fallback;
  }
  return fallback;
}