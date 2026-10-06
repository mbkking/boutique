/**
 * Espaces applicatifs : boutique, administration, livreur.
 *
 * UNE SEULE application Next.js, UNE SEULE base Supabase. L'espace servi est
 * déterminé par l'hôte de la requête (port en développement, sous-domaine en
 * production), jamais par le navigateur :
 *
 * - `:3000` (ou hôte public) → boutique client ;
 * - `:3002` (ou `admin.*`) → administration ;
 * - `:3003` (ou `livreur.*`, `driver.*`) → espace livreur ;
 * - tout autre hôte → boutique (comportement historique conservé).
 *
 * Pur TypeScript, compatible Edge (middleware) et testable en unitaire.
 */

export type Space = "client" | "admin" | "driver";

export const SPACE_PORTS: Record<Space, number> = {
  client: 3000,
  admin: 3002,
  driver: 3003,
};

export const SPACE_LABELS: Record<Space, string> = {
  client: "Boutique",
  admin: "Administration",
  driver: "Espace livreur",
};

/** Chemins toujours accessibles quel que soit l'espace (santé, PWA, auth). */
const ALWAYS_ALLOWED_PREFIXES = [
  "/espace-indisponible",
  "/offline.html",
  "/api/",
] as const;

/** Authentification : connexion + mot de passe oublié + retour Supabase. */
const AUTH_PREFIXES = [
  "/connexion",
  "/mot-de-passe-oublie",
  "/reinitialiser-mot-de-passe",
  "/auth/",
] as const;

/**
 * L'hôte désigne-t-il EXPLICITEMENT un espace ?
 *
 * Seuls un port dédié (:3000/:3002/:3003) ou un sous-domaine reconnu
 * (`admin.*`, `livreur.*`, `driver.*`) activent la séparation stricte. Tout
 * autre hôte (domaine unique en production, port exotique) conserve le
 * comportement historique : tous les chemins sont servis, la protection
 * restant assurée par les rôles (middleware + layouts + RLS).
 */
export function isSpaceEnforced(host: string | null | undefined): boolean {
  if (!host) return false;
  const normalized = host.toLowerCase().trim();

  const portMatch = normalized.match(/:(\d+)$/);
  if (portMatch) {
    return ["3000", "3002", "3003"].includes(portMatch[1]);
  }

  const firstLabel = normalized.split(".")[0];
  return ["admin", "livreur", "driver"].includes(firstLabel);
}

/**
 * Espace servi pour cet hôte (en-tête `Host`, avec ou sans port).
 * Insensible à la casse. Un hôte inconnu donne la boutique : on ne bloque
 * jamais l'accès public par défaut.
 */
export function getSpaceFromHost(host: string | null | undefined): Space {
  if (!host) return "client";
  const normalized = host.toLowerCase().trim();

  const portMatch = normalized.match(/:(\d+)$/);
  const port = portMatch ? portMatch[1] : null;
  if (port === String(SPACE_PORTS.admin)) return "admin";
  if (port === String(SPACE_PORTS.driver)) return "driver";

  const hostname = portMatch
    ? normalized.slice(0, normalized.length - portMatch[0].length)
    : normalized;
  if (hostname === "admin" || hostname.startsWith("admin.")) return "admin";
  if (
    hostname === "livreur" ||
    hostname.startsWith("livreur.") ||
    hostname === "driver" ||
    hostname.startsWith("driver.")
  ) {
    return "driver";
  }

  return "client";
}

function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
}

/**
 * Ce chemin peut-il être servi dans cet espace ?
 *
 * - boutique : tout sauf `/admin/*`, `/livreur/*`, `/driver/*` ;
 * - administration : `/admin/*` + authentification ;
 * - livreur : `/livreur/*`, `/driver/*` + authentification.
 *
 * `/espace-indisponible`, `/offline.html` et `/api/*` passent partout : les
 * server actions et l'API d'export appliquent leurs propres contrôles.
 */
export function isPathAllowedInSpace(pathname: string, space: Space): boolean {
  if (startsWithAny(pathname, ALWAYS_ALLOWED_PREFIXES)) return true;

  switch (space) {
    case "admin":
      if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
      return startsWithAny(pathname, AUTH_PREFIXES);
    case "driver":
      if (
        pathname === "/livreur" ||
        pathname.startsWith("/livreur/") ||
        pathname === "/driver" ||
        pathname.startsWith("/driver/")
      ) {
        return true;
      }
      return startsWithAny(pathname, AUTH_PREFIXES);
    case "client":
      if (
        pathname === "/admin" ||
        pathname.startsWith("/admin/") ||
        pathname === "/livreur" ||
        pathname.startsWith("/livreur/") ||
        pathname === "/driver" ||
        pathname.startsWith("/driver/")
      ) {
        return false;
      }
      return true;
  }
}

/**
 * Espace propriétaire d'un chemin (pour les redirections inter-espaces
 * après connexion : un admin connecté sur :3000 doit atterrir sur :3002).
 */
export function getSpaceForPath(pathname: string): Space {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (
    pathname === "/livreur" ||
    pathname.startsWith("/livreur/") ||
    pathname === "/driver" ||
    pathname.startsWith("/driver/")
  ) {
    return "driver";
  }
  return "client";
}

/**
 * URL d'un espace sibling (pour la page « mauvais espace »).
 * En développement on permute le port ; en production on permute le
 * sous-domaine quand il est reconnu, sinon on propose les ports locaux.
 */
export function siblingSpaceUrl(host: string, target: Space): string {
  const normalized = host.toLowerCase().trim();
  const portMatch = normalized.match(/:(\d+)$/);
  if (portMatch) {
    return `http://${normalized.slice(0, normalized.length - portMatch[0].length)}:${SPACE_PORTS[target]}`;
  }
  const parts = normalized.split(".");
  if (parts.length > 2 || parts[0] === "www") {
    const base = (parts[0] === "www" ? parts.slice(1) : parts.slice(1)).join(".");
    const prefix = target === "client" ? "" : target === "admin" ? "admin." : "livreur.";
    return `https://${prefix}${base}`;
  }
  return `http://localhost:${SPACE_PORTS[target]}`;
}
