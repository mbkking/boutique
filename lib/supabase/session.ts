import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types";

export interface AuthenticatedUser {
  profile: Profile;
}

export type AuthResult =
  | { authenticated: true; profile: Profile }
  | { authenticated: false; reason: string };

/**
 * Récupère le profil de l'utilisateur connecté à partir de la session Supabase.
 * Retourne `null` si personne n'est connecté ou si la base est injoignable :
 * la vérification d'authentification ne doit jamais faire échouer un rendu.
 */
export async function getSessionProfile(): Promise<Profile | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, phone, role, is_active, created_at, updated_at")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError || !profile) return null;
    if (!profile.is_active) return null;

    return profile as Profile;
  } catch {
    // Base injoignable ou variables d'environnement absentes.
    return null;
  }
}

/**
 * Adresse e-mail de l'utilisateur connecté, lue dans la session d'authentique
 * (jamais stockée dans `profiles`). `null` si personne n'est connecté : les
 * comptes créés par téléphone peuvent ne pas avoir d'e-mail.
 */
export async function getSessionEmail(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user.email ?? null;
  } catch {
    return null;
  }
}

/** Récupère l'utilisateur connecté, ou une raison de refus lisible en français. */
export async function getAuthenticatedUser(): Promise<AuthResult> {
  const profile = await getSessionProfile();
  if (!profile) {
    return {
      authenticated: false,
      reason: "Vous devez être connecté pour accéder à cette page.",
    };
  }
  return { authenticated: true, profile };
}

/** Récupère l'utilisateur connecté à condition qu'il ait l'un des rôles autorisés. */
export async function requireRole(
  allowedRoles: readonly UserRole[]
): Promise<AuthResult> {
  const result = await getAuthenticatedUser();
  if (!result.authenticated) return result;

  if (!allowedRoles.includes(result.profile.role)) {
    return {
      authenticated: false,
      reason: "Vous n'avez pas les droits nécessaires pour effectuer cette action.",
    };
  }

  return result;
}

/**
 * Rôles autorisés à administrer les commandes et les livraisons.
 * Volontairement restreint : `stock_manager` n'a pas ces droits.
 *
 * @deprecated Préférer `requirePermission` (lib/auth/guard.ts) : la matrice de
 * droits est plus expressive et ne peut pas diverger de l'interface.
 */
export const ADMIN_ROLES: readonly UserRole[] = ["admin", "order_operator"];

/**
 * Rôles autorisés à consulter le back-office `/admin`.
 * Plus large que {@link ADMIN_ROLES} : le gestionnaire de stock doit voir
 * l'interface, mais ses droits d'écriture restent vérifiés action par action.
 */
export const STAFF_ROLES: readonly UserRole[] = [
  "admin",
  "order_operator",
  "stock_manager",
];

export const DRIVER_ROLES: readonly UserRole[] = ["driver", "admin"];