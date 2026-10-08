import type { MetadataRoute } from "next";

/**
 * Manifest de l'application d'administration.
 *
 * Volontairement distinct du manifest boutique : cette application n'a pas de
 * page `/` (les routes démarrent à `/admin`), un `start_url` de `/` y
 * afficherait une 404 une fois l'app installée.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/admin",
    name: "Administration — ISF NAF-CHOPOP",
    short_name: "Admin ISF",
    description:
      "Back-office ISF NAF-CHOPOP : commandes, produits, clients et promotions.",
    lang: "fr",
    dir: "ltr",
    start_url: "/admin",
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
