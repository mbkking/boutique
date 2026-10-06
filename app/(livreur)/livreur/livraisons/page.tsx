/**
 * Missions en cours du livreur — espace `/livreur`.
 *
 * Réexport du composant existant : aucune logique dupliquée.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mes missions",
  robots: { index: false, follow: false },
};

export { default } from "@/app/(delivery)/driver/deliveries/page";
