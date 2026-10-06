import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

/**
 * Lecture explicite du fichier d'environnement de l'application.
 *
 * \'next.config.ts\' est évalué **avant** que Next.js ne charge les fichiers
 * \'.env\' : sans cette lecture, les variables publiques seraient vides au
 * moment de leur déclaration dans \'env\', donc vides dans les bundles
 * navigateur — et les composants clients échoueraient au premier rendu.
 */
function readAppEnv(): Record<string, string> {
  const path = fileURLToPath(new URL("./.env.local", import.meta.url));
  if (!existsSync(path)) return {};

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\\r?\\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );
}

const appEnv = readAppEnv();

/**
 * Configuration de l'application `driver`.
 *
 * Volontairement identique à la configuration racine pour les éléments
 * partagés (hôtes d'images Supabase, en-têtes de sécurité), mais déclarée
 * dans l'application : chaque application est construite et servie de façon
 * autonome.
 */
const storageHost = (() => {
  const url = appEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), geolocation=(self), microphone=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Les sources partagées vivent hors du dossier de l'application.
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: storageHost
      ? [
          {
            protocol: "https" as const,
            hostname: storageHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Le service worker doit pouvoir être mis à jour à tout moment.
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
