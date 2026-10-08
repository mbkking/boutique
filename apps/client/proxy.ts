import { createAppMiddleware } from "@repo/lib/auth/app-middleware";

/**
 * Garde de l'application `client` — Boutique client.
 *
 * Le rôle est lu en base à chaque requête protégée : un client qui saisit
 * manuellement une URL d'administration est refusé, et une session admin ne
 * peut pas être réutilisée sur un autre port (nom de cookie propre).
 */
export const proxy = createAppMiddleware("client");

/**
 * Chemins non couverts par le proxy : fichiers statiques et assets.
 *
 * Objet statique : Next.js le lit au build, il ne peut pas être
 * construit à l'exécution.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|offline.html|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
