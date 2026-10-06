import "server-only";

import { redirect } from "next/navigation";
import { getAuthenticatedUser, type AuthResult } from "@/lib/supabase/session";
import { SIGN_IN_PATH } from "@/lib/auth/redirect";
import {
  can,
  canAll,
  canAny,
  PERMISSIONS,
  type Permission,
} from "@/lib/auth/permissions";
import type { Profile, UserRole } from "@/types";

/** Motif de refus standardisé, réutilisé par les actions et les pages. */
export const FORBIDDEN_REASON =
  "Vous n'avez pas les droits nécessaires pour effectuer cette action.";



/**
 * Vérifie un droit pour une server action.
 * Retourne un refus explicite plutôt que de laisser l'appelur deviner.
 */
export async function requirePermission(
  permission: Permission
): Promise<AuthResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.authenticated) return auth;

  if (!can(auth.profile.role, permission)) {
    return { authenticated: false, reason: FORBIDDEN_REASON };
  }

  return auth;
}

/** Variante « au moins un de ces droits suffit ». */
export async function requireAnyPermission(
  permissions: readonly Permission[]
): Promise<AuthResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.authenticated) return auth;

  if (!canAny(auth.profile.role, permissions)) {
    return { authenticated: false, reason: FORBIDDEN_REASON };
  }

  return auth;
}

/**
 * Garde de layout pour une page interne.
 *
 * Redirige vers la connexion si l'utilisateur n'est pas identifié, et vers la
 * page d'accueil avec un message s'il est authentifié mais sans le droit.
 * Dans les deux cas, aucun contenu de la page n'est rendu.
 */
export async function guardPage(permissions: readonly Permission[]): Promise<Profile> {
  const auth = await getAuthenticatedUser();

  if (!auth.authenticated) {
    redirect(SIGN_IN_PATH);
  }

  if (!canAny(auth.profile.role, permissions)) {
    redirect(`/?erreur=${encodeURIComponent(FORBIDDEN_REASON)}`);
  }

  return auth.profile;
}

/** Le rôle détient-il l'intégralité des droits de l'application ? */
export function hasFullAccess(role: UserRole | null | undefined): boolean {
  return canAll(role, Object.values(PERMISSIONS));
}