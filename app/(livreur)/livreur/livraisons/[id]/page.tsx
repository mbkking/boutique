/**
 * Détail d'une mission — espace `/livreur`.
 *
 * Réexport du composant existant : la requête filtre sur `driver_id`, un
 * identifiant deviné ne donne accès à aucune livraison qui n'est pas celle
 * du livreur.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Détail de la mission",
  robots: { index: false, follow: false },
};

export { default } from "@/app/(delivery)/driver/deliveries/[id]/page";
