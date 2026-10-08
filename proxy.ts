import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { canAny, PERMISSIONS } from "@/lib/auth/permissions";
import {
  FORBIDDEN_REDIRECT_REASON,
  SIGN_IN_PATH,
  homePathForRole,
} from "@/lib/auth/redirect";
import {
  getSpaceFromHost,
  isPathAllowedInSpace,
  isSpaceEnforced,
} from "@/lib/auth/space";
import type { UserRole } from "@/types";

/**
 * Proxy de l'application racine (boutique en production).
 *
 * Rôles :
 *
 * 1. **Rafraîchir la session** — `lib/supabase/server.ts` ignore les cookies
 *    rafraîchis depuis un Server Component (« le middleware rafraîchit la
 *    session ») : sans cet appel, un jeton expiré fait échouer la rotation du
 *    refresh token et l'utilisateur est déconnecté à tort.
 * 2. **Séparation des espaces par hôte** — uniquement quand le hôte
 *    l'explicite (`isSpaceEnforced` : ports dédiés en dev, sous-domaines
 *    reconnus). Un domaine unique en production continue de servir tous les
 *    chemins : la protection des espaces reste alors celle des layouts
 *    (`guardPage`) et de la RLS.
 * 3. **Espaces protégés** `/admin`, `/livreur`, `/driver` — session exigée,
 *    puis droits d'entrée vérifiés sur le rôle réel lu en base.
 * 4. **Pages d'authentification** — un visiteur déjà connecté est renvoyé vers
 *    son espace, jamais rendu un formulaire de connexion superflu.
 * 5. **Réinitialisation de mot de passe** — exigée côté middleware : un
 *    `redirect()` après `await` dans la page ne produirait qu'une redirection
 *    côté client (statut 200), pas un 307 propre.
 *
 * `/account` et `/compte` ne sont pas redirigés ici : leur page affiche
 * elle-même le formulaire de connexion (cf. boucle de redirection historique
 * documentée dans `app/(account)/account/layout.tsx`).
 */

/** Droits suffisants pour entrer dans le back-office (cf. AdminLayout). */
const ADMIN_ENTRY_PERMISSIONS = [
  PERMISSIONS.ORDER_READ,
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.PRODUCT_READ,
  PERMISSIONS.CUSTOMER_READ,
  PERMISSIONS.SETTINGS_READ,
] as const;

/** Droits suffisants pour entrer dans l'espace livreur. */
const DRIVER_ENTRY_PERMISSIONS = [
  PERMISSIONS.DELIVERY_READ_OWN,
  PERMISSIONS.DELIVERY_READ_ALL,
] as const;

function isAdminSpace(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isDriverSpace(pathname: string): boolean {
  return (
    pathname === "/livreur" ||
    pathname.startsWith("/livreur/") ||
    pathname === "/driver" ||
    pathname.startsWith("/driver/")
  );
}

function isAuthPage(pathname: string): boolean {
  return (
    pathname === "/connexion" ||
    pathname === "/inscription" ||
    pathname === "/mot-de-passe-oublie"
  );
}

export async function proxy(request: NextRequest) {
  const { response, supabase } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  // Séparation des espaces par hôte (dev : ports, prod : sous-domaines).
  // Un chemin hors de son espace n'est jamais servi : réécriture vers la
  // page d'orientation (URL conservée, aucune donnée exposée).
  const host = request.headers.get("host");
  const space = getSpaceFromHost(host);
  if (isSpaceEnforced(host) && !isPathAllowedInSpace(pathname, space)) {
    const blocked = new URL("/espace-indisponible", request.url);
    blocked.searchParams.set("espace", space);
    blocked.searchParams.set("from", `${pathname}${search}`);
    const rewritten = NextResponse.rewrite(blocked);
    for (const cookie of response.cookies.getAll()) {
      rewritten.cookies.set(cookie);
    }
    return rewritten;
  }

  const protectedSpace = isAdminSpace(pathname) || isDriverSpace(pathname);
  const authPage = isAuthPage(pathname);
  const isPasswordReset = pathname === "/reinitialiser-mot-de-passe";

  if (!protectedSpace && !authPage && !isPasswordReset) return response;

  let role: UserRole | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", user.id)
        .maybeSingle();

      if (profile && profile.is_active) {
        role = profile.role as UserRole;
      } else if (profile && !profile.is_active) {
        console.warn("[proxy] compte désactivé :", user.id);
      }
    }
  } catch {
    role = null;
  }

  if (authPage) {
    if (role) {
      return NextResponse.redirect(
        new URL(homePathForRole(role) ?? "/", request.url)
      );
    }
    return response;
  }

  if (isPasswordReset) {
    if (!role) {
      const expired = new URL("/mot-de-passe-oublie", request.url);
      expired.searchParams.set("lien", "expire");
      return NextResponse.redirect(expired);
    }
    return response;
  }

  if (!role) {
    const login = new URL(SIGN_IN_PATH, request.url);
    login.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const required = isAdminSpace(pathname)
    ? ADMIN_ENTRY_PERMISSIONS
    : DRIVER_ENTRY_PERMISSIONS;

  if (!canAny(role, [...required])) {
    if (homePathForRole(role) === null) {
      console.warn("[proxy] rôle inconnu :", role);
    }
    const home = new URL(homePathForRole(role) ?? "/", request.url);
    home.searchParams.set("erreur", FORBIDDEN_REDIRECT_REASON);
    return NextResponse.redirect(home);
  }

  return response;
}

/**
 * Chemins non couverts par le proxy : fichiers statiques et assets PWA.
 *
 * `offline.html` fait partie des exclusions : le service worker la met en
 * cache à l'installation, et une session exigée renverrait la page de
 * connexion à la place (fallback offline corrompu).
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|offline.html|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
