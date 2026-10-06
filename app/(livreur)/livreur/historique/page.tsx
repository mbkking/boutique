/**
 * Historique des livraisons terminées — espace `/livreur`.
 *
 * Réexport du composant existant : aucune logique dupliquée.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mon historique",
  robots: { index: false, follow: false },
};

export { default } from "@/app/(delivery)/driver/history/page";
