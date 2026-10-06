/**
 * Tableau de bord livreur — espace `/livreur`.
 *
 * Réutilise le composant de l'espace livreur existant sans dupliquer la
 * logique : la garde de rôle est assurée par le layout parent, et les données
 * restent filtrées par livreur dans `lib/data/driver.ts`.
 *
 * (La configuration de route — `dynamic`, `metadata` — est déclarée ici :
 * Next.js exige qu'elle soit analysable statiquement dans chaque fichier.)
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mes livraisons",
  robots: { index: false, follow: false },
};

export { default } from "@/app/(delivery)/driver/page";
