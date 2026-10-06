import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ISF NAF-CHOPOP — vente en ligne à Niamey",
    short_name: "ISF NAF",
    description:
      "Commandez en ligne à Niamey : meubles, vêtements, chaussures, parfums et accessoires. Paiement à la livraison.",
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1e2a2d",
    categories: ["shopping", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // Variante « maskable » : le glyphe doit tenir dans la zone sûre.
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}