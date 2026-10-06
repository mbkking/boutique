export { default, metadata } from "@/app/(account)/account/page";

/**
 * Alias de `/account`.
 *
 * Le reste de l'interface peut référencer l'une ou l'autre des deux routes :
 * cette page ré-exporte la même implémentation pour que les deux fonctionnent,
 * sans dupliquer la logique ni le contenu.
 */

// Rendu à la demande, comme la page d'origine : un compte connecté ne doit
// jamais être mis en cache (commandes en cours, profil).
export const revalidate = 0;
export const dynamic = "force-dynamic";