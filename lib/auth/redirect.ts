import type { UserRole } from "@/types";
import {
  getSpaceForPath,
  getSpaceFromHost,
  isSpaceEnforced,
  siblingSpaceUrl,
} from "@/lib/auth/space";

/**
 * Redirections d'atterrissage par rôle.
 *
 * Source unique de vérité utilisée par :
 * - la page `/connexion` (après authentification),
 * - le middleware (accès direct à une route protégée, visiteur déjà connecté),
 * - les server actions d'authentification.
 *
 * Un seul point de décision : impossible qu'une page et le middleware
 * redirigent le même rôle vers deux espaces différents.
 */

/** Portail d'entrée unique : une seule connexion pour tous les rôles. */
export const SIGN_IN_PATH = "/connexion";

/** Message affiché quand un visiteur authentifié tente un espace interdit. */
export const FORBIDDEN_REDIRECT_REASON =
  "Votre compte n'a pas accès à cet espace.";

/**
 * Espace d'atterrissage d'un rôle.
 *
 * - `customer` → espace client ;
 * - `driver` → espace livreur ;
 * - `admin`, `order_operator`, `stock_manager` → back-office ;
 * - rôle inconnu ou absent → `null` : l'appelant applique une redirection
 *   sûre (accueil) au lieu d'ouvrir un espace privilégié.
 */
export function homePathForRole(role: UserRole | null | undefined): string | null {
  switch (role) {
    case "customer":
      return "/compte";
    case "driver":
      return "/driver";
    case "admin":
    case "order_operator":
    case "stock_manager":
      return "/admin";
    default:
      return null;
  }
}

/**
 * Valide un paramètre `returnTo` contre les redirections ouvertes.
 *
 * Seul un chemin interne absolu est accepté : il commence par `/`, ne
 * commence pas par `//` (URL protocol-relative), ne contient ni antislash
 * ni schéma. Toute autre valeur — y compris `https://evil.example` ou
 * `javascript:...` — est refusée.
 */
export function isSafeReturnTo(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return false;
  }

  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("\\")) return false;

  const lower = value.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return false;
  }

  try {
    // Un chemin relatif valide ne doit pas être parsé comme une URL absolue.
    const parsed = new URL(value, "http://interne");
    if (parsed.origin !== "http://interne") return false;
  } catch {
    return false;
  }

  return true;
}

/**
 * Choisit la destination post-connexion : le `returnTo` demandé s'il est sûr
 * ET autorisé au rôle, sinon l'espace d'atterrissage du rôle.
 *
 * Un `returnTo` vers un espace interdit au rôle est ignoré : un client ne
 * peut pas se faire rediriger vers `/admin` en le glissant dans l'URL de
 * connexion.
 */
export function resolvePostLoginPath(
  role: UserRole | null | undefined,
  returnTo: unknown,
  isPathAllowedForRole: (path: string, role: UserRole | null | undefined) => boolean
): string {
  const home = homePathForRole(role) ?? "/";
  if (isSafeReturnTo(returnTo) && isPathAllowedForRole(returnTo, role)) {
    return returnTo;
  }
  return home;
}

/**
 * Destination post-connexion tenant compte de l'espace courant.
 *
 * Quand la séparation stricte est active (ports :3000/:3002/:3003) et que la
 * destination appartient à un autre espace, renvoie l'URL absolue de l'espace
 * sibling : un admin connecté sur :3000 atterrit sur :3002, jamais sur une
 * page « espace indisponible ». Sans séparation stricte (domaine unique),
 * renvoie le chemin relatif inchangé.
 */
export function resolveLoginDestination(
  host: string | null | undefined,
  role: UserRole | null | undefined,
  returnTo: unknown
): string {
  const destination = resolvePostLoginPath(role, returnTo, isPathAllowedForRole);

  if (!isSpaceEnforced(host)) return destination;

  const current = getSpaceFromHost(host);
  const target = getSpaceForPath(destination);
  if (target === current || !host) return destination;

  return `${siblingSpaceUrl(host, target)}${destination}`;
}

/**
 * Ce chemin appartient-il à un espace réservé à un autre rôle que celui-ci ?
 *
 * Règle minimale et lisible : les préfixes protégés sont comparés aux droits
 * du rôle via la matrice `permissions.ts` quand c'est possible ; à défaut,
 * cette fonction exprime la correspondance préfixe → rôles admis.
 */
export function isPathAllowedForRole(
  path: string,
  role: UserRole | null | undefined
): boolean {
  if (path.startsWith("/admin")) {
    return role === "admin" || role === "order_operator" || role === "stock_manager";
  }
  if (path.startsWith("/livreur") || path.startsWith("/driver")) {
    return role === "driver" || role === "admin";
  }
  if (path.startsWith("/compte") || path.startsWith("/account")) {
    // L'espace compte exige une session valide, quel que soit le rôle : la
    // page elle-même affine l'affichage. Refuser ici casserait les parcours
    // admin/operateur qui consultent aussi leur fiche.
    return role !== null && role !== undefined;
  }
  return true;
}
