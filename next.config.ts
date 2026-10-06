import type { NextConfig } from "next";
import { assertEnvironment } from "./lib/config/env";

/**
 * Hôte des visuels produit.
 *
 * Les photos sont hébergées dans le bucket Supabase Storage du projet. On
 * n'autorise pas `hostname: "**"` : cela autoriserait n'importe quelle origine
 * HTTPS à être chargée via `next/image`, ce qui ouvre la porte au pistage
 * d'utilisateurs et à des contenus hostiles.
 */
const storageHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

const imageRemotePatterns = storageHost
  ? [{ protocol: "https" as const, hostname: storageHost, pathname: "/storage/v1/object/public/**" }]
  : [];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    // La géolocalisation est autorisée : l'espace livreur en dépend.
    value: "camera=(self), geolocation=(self), microphone=(), payment=()",
  },
];

/**
 * Validation de la configuration au démarrage (§62).
 *
 * Appelée ici, au chargement de la configuration : la vérification a lieu une
 * seule fois, avant tout traitement de requête. Échouer tard produirait une
 * cascade de « fetch failed » difficile à diagnostiquer.
 */
if (process.env.NODE_ENV !== "test") {
  assertEnvironment();
}

const nextConfig: NextConfig = {
  // Le site se sert de sa propre identité : inutile d'annoncer Next.js.
  poweredByHeader: false,

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: imageRemotePatterns,
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Le service worker ne doit jamais être mis en cache par le navigateur,
        // sinon une mise à jour peut ne jamais être déployée.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;