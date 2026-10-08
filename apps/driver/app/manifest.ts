import type { MetadataRoute } from "next";

/**
 * Manifest de l'application livreur.
 *
 * Volontairement distinct du manifest boutique : cette application n'a pas de
 * page `/` (les routes démarrent à `/driver`), un `start_url` de `/` y
 * afficherait une 404 une fois l'app installée.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/driver",
    name: "Espace livreur — ISF NAF-CHOPOP",
    short_name: "Livreur",
    description:
      "Espace livreur ISF NAF-CHOPOP : livraisons, statuts et suivi en temps réel.",
    lang: "fr",
    dir: "ltr",
    start_url: "/driver",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1e2a2d",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
