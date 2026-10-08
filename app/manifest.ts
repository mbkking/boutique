import { headers } from "next/headers";
import type { MetadataRoute } from "next";
import { getSpaceFromHost } from "@/lib/auth/space";

// Le manifest dépend du Host : jamais de mise en cache partagée entre espaces.
export const dynamic = "force-dynamic";

/**
 * Manifest PWA servit par la racine.
 *
 * Les trois domaines de production (boutique, administration, livreur) sont
 * déployés depuis le même projet racine : sans discrimination par hôte, chaque
 * espace recevrait le manifest boutique (`start_url:/`), ce qui casse
 * l'installation de l'app admin (page `/` inexistante dans l'esprit de
 * l'app). Le manifest est donc rendu dynamique : l'espace est déduit de
 * l'en-tête `Host` (ports en dev, sous-domaines/noms de domaine en prod).
 */
function spaceFromHost(host: string | null | undefined): "client" | "admin" | "driver" {
  // Ports dédiés et sous-domaines explicites (admin., livreur., driver.).
  const strict = getSpaceFromHost(host);
  if (strict !== "client") return strict;

  // Domaines de production : `boutique-admin-niger.vercel.app`,
  // `livreur-nu.vercel.app` (première étiquette non reconnue par le
  // détecteur strict, qui privilégie l'host historique).
  const hostname = (host ?? "").toLowerCase().split(":")[0];
  if (hostname.includes("admin")) return "admin";
  if (hostname.includes("livreur") || hostname.includes("driver")) return "driver";
  return "client";
}

const ICONS: MetadataRoute.Manifest["icons"] = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  // Variante « maskable » : le glyphe doit tenir dans la zone sûre.
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

const MANIFESTS: Record<"client" | "admin" | "driver", MetadataRoute.Manifest> = {
  client: {
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
    icons: ICONS,
  },
  admin: {
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
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1e2a2d",
    categories: ["business", "productivity"],
    icons: ICONS,
  },
  driver: {
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
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1e2a2d",
    categories: ["business", "productivity"],
    icons: ICONS,
  },
};

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = (await headers()).get("host");
  return MANIFESTS[spaceFromHost(host)];
}
