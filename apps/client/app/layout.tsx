import RootLayout from "@repo/app/layout";

/**
 * Layout racine de l'application client.
 *
 * Le layout racine du dépôt (en-tête, pied de page, panier, PWA) est
 * réutilisé tel quel : l'application client n'en est qu'une instance avec son
 * propre contexte Next et sa propre session.
 */
export default RootLayout;
