import type { MetadataRoute } from "next";

const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
);

/**
 * Directives robots.
 *
 * Les zones privées (compte, panier, checkout) et l'espace d'administration
 * sont exclus de l'indexation. Aucune donnée n'est requise côté base : le
 * fichier reste générable même si la boutique est hors ligne.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/driver",
          "/livreur",
          "/account",
          "/compte",
          "/connexion",
          "/inscription",
          "/mot-de-passe-oublie",
          "/reinitialiser-mot-de-passe",
          "/auth/",
          "/checkout",
          "/cart",
          "/orders/",
          "/api/",
          "/search",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}