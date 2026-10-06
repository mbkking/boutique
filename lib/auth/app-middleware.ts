import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { canAny, PERMISSIONS } from "@/lib/auth/permissions";
import { FORBIDDEN_REDIRECT_REASON, homePathForRole } from "@/lib/auth/redirect";
import { isPathAllowedInSpace, type Space } from "@/lib/auth/space";
import type { UserRole } from "@/types";

/**
 * Middleware commun aux trois applications.
 *
 * Chaque application a son **propre** proxy, sa propre application Next et son
 * propre nom de cookie de session : `createAppMiddleware("admin")` construit une
 * garde qui :
 *
 * 1. rafraîchit la session de l'application (jamais celle d'une autre) ;
 * 2. n'expose que les chemins de son espace (`isPathAllowedInSpace`, source
 *    unique de vérité) ;
 * 3. exige une session et les permissions d'entrée de son espace ;
 * 4. redirige un visiteur déjà connecté vers son propre espace.
 *
 * Règle d'isolation, une seule : un chemin qui n'appartient pas à l'espace
 * servi n'est JAMAIS rendu — ni par URL directe, ni par préchargement, ni par
 * navigation côté client. Il est réécrit vers `/espace-indisponible`, page
 * publique présente dans les trois applications, qui explique la situation et
 * propose le lien vers l'espace propriétaire.
 *
 * Le rôle provient de la table `profiles`, lue via le client authentifié : il
 * n'est jamais pris dans le navigateur. La RLS reste l'autorité finale.
 */

/** Droits d'entrée de l'administration. */
export const ADMIN_ENTRY_PERMISSIONS = [
  PERMISSIONS.ORDER_READ,
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.PRODUCT_READ,
  PERMISSIONS.CUSTOMER_READ,
  PERMISSIONS.SETTINGS_READ,
] as const;

/** Droits d'entrée de l'espace livreur. */
export const DRIVER_ENTRY_PERMISSIONS = [
  PERMISSIONS.DELIVERY_READ_OWN,
  PERMISSIONS.DELIVERY_READ_ALL,
] as const;

/**
 * Chemins de l'espace client qui exigent une session.
 *
 * `/checkout` n'en fait pas partie : la commande invitée est le parcours
 * principal du MVP (checklist « Commande invitée », sécurité « Visiteur non
 * authentifié → checkout invité »). La page elle-même n'exige aucune session,
 * et l'action `checkoutAction` applique alors la garde anti-robot invité.
 */
const CLIENT_PROTECTED_PREFIXES = ["/account", "/compte"] as const;

/** Chemins d'authentification, autorisés dans les trois applications. */
const AUTH_PREFIXES = [
  "/connexion",
  "/inscription",
  "/mot-de-passe-oublie",
  "/reinitialiser-mot-de-passe",
] as const;

function isAuthPage(pathname: string): boolean {
  return AUTH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Réponse d'orientation pour un chemin appartenant à un autre espace.
 *
 * Le chemin demandé n'est pas rendu : il est réécrit vers
 * `/espace-indisponible`, qui affiche « Cet espace n'est pas disponible ici »
 * et propose le lien vers l'espace propriétaire (`?from=` indique le chemin
 * demandé). Réécrire plutôt que rediriger garde l'URL demandée et évite un
 * 307 silencieux vers l'accueil qui masque la cause réelle.
 *
 * Cette page étant publique, aucune donnée de l'espace visé n'est exposée :
 * seul le chemin demandé est repris dans le texte. Les cookies rafraîchis par
 * `updateSession` sont recopiés à l'identique — l'orientation ne touche
 * jamais à la session existante.
 */
function spaceUnavailable(
  request: NextRequest,
  session: NextResponse,
  pathname: string
): NextResponse {
  const target = new URL("/espace-indisponible", request.url);
  target.searchParams.set("from", pathname);

  const rewritten = NextResponse.rewrite(target);
  for (const cookie of session.cookies.getAll()) {
    rewritten.cookies.set(cookie);
  }
  return rewritten;
}

function requiresSession(pathname: string, space: Space): boolean {
  // Les routes API appliquent leurs propres contrôles et répondent en JSON :
  // une redirection vers la page de connexion renverrait du HTML et masquerait
  // l'erreur réelle (403 pour l'export, 400 pour un appel mal formé).
  if (pathname.startsWith("/api/")) return false;
  if (space === "admin") return true;
  if (space === "driver") return true;
  return CLIENT_PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

async function readRole(
  supabase: Awaited<ReturnType<typeof updateSession>>["supabase"]
): Promise<UserRole | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !profile.is_active) return null;
    return profile.role as UserRole;
  } catch {
    return null;
  }
}

export function createAppMiddleware(space: Space) {
  return async function appMiddleware(request: NextRequest) {
    const { response, supabase } = await updateSession(request);
    const { pathname, search } = request.nextUrl;

    // 1. Cette application ne sert que son espace : un chemin d'une autre
    //    application n'est jamais rendu, même par URL directe. La réponse est
    //    la page d'orientation du même espace — pas une redirection vers `/`,
    //    qui n'existe pas dans les applications admin et livreur et qui
    //    masquerait la cause réelle derrière un 307 silencieux.
    if (!isPathAllowedInSpace(pathname, space)) {
      return spaceUnavailable(request, response, pathname);
    }

    const authPage = isAuthPage(pathname);

    // 2. Mot de passe oublié : page publique.
    if (authPage && pathname !== "/reinitialiser-mot-de-passe") {
      if (!requiresSession(pathname, space) && !authPage) return response;
    }

    const needsSession = requiresSession(pathname, space) || authPage;

    if (!needsSession) return response;

    const role = await readRole(supabase);

    if (authPage) {
      if (!role) return response;
      const home = homePathForRole(role);
      // Un compte déjà connecté n'a pas à se reconnecter : il est renvoyé
      // vers son espace, y compris hors de cette application.
      if (!home) return response;
      return NextResponse.redirect(new URL(home, request.url));
    }

    if (!role) {
      const login = new URL("/connexion", request.url);
      login.searchParams.set("returnTo", `${pathname}${search}`);
      return NextResponse.redirect(login);
    }

    // 3. Droits d'entrée, vérifiés côté serveur sur le rôle réel.
    const required =
      space === "admin"
        ? ADMIN_ENTRY_PERMISSIONS
        : space === "driver"
          ? DRIVER_ENTRY_PERMISSIONS
          : [];

    if (required.length > 0 && !canAny(role, [...required])) {
      const home = homePathForRole(role) ?? "/";
      const target = new URL(home, request.url);
      target.searchParams.set("erreur", FORBIDDEN_REDIRECT_REASON);
      return NextResponse.redirect(target);
    }

    return response;
  };
}

/**
 * Correspondance utilisée par les trois applications.
 *
 * Les fichiers statiques et les assets publics ne passent pas par le
 * middleware.
 */
export const middlewareConfig = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};