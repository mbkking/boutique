// Patch one-shot des gabarits de scripts/generate-apps.mjs (PWA mission).
// Idempotent, respecte les fins de ligne CRLF du fichier cible.
import { readFileSync, writeFileSync } from "node:fs";

const path = "scripts/generate-apps.mjs";
let s = readFileSync(path, "utf8");
const CRLF = s.includes("\r\n");
const nl = (t) => (CRLF ? t.split("\n").join("\r\n") : t);

/* 1. LAYOUT_ADMIN → contenu avec ServiceWorkerRegistrar + metadata complètes */
const startAdmin = s.indexOf("const LAYOUT_ADMIN = `");
const endAdmin = s.indexOf("const LAYOUT_DRIVER = `");
if (startAdmin < 0 || endAdmin < 0) throw new Error("bornes LAYOUT introuvables");

if (!s.slice(startAdmin, endAdmin).includes("ServiceWorkerRegistrar")) {
  const newAdmin = nl(`const LAYOUT_ADMIN = \`import type { Metadata, Viewport } from "next";

import "@repo/app/globals.css";
import { Providers } from "@repo/components/layout/providers";
import { ServiceWorkerRegistrar } from "@repo/components/layout/service-worker-registrar";

/**
 * Layout racine de l'application d'administration.
 *
 * Volontairement **sans** l'en-tête et le pied de page de la boutique : le
 * back-office a sa propre coque (barre latérale, en-tête, thème). Cette
 * application ne sert que des routes \`/admin/*\`.
 */
export const metadata: Metadata = {
  title: {
    default: "Administration",
    template: "%s | Administration",
  },
  description:
    "Back-office de la boutique ISF NAF-CHOPOP : commandes, produits, clients et promotions.",
  applicationName: "Administration ISF NAF-CHOPOP",
  appleWebApp: {
    capable: true,
    title: "Administration",
    statusBarStyle: "default",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1e2a2d",
};

export const dynamic = "force-dynamic";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers>
          <ServiceWorkerRegistrar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
\`;

`);
  s = s.slice(0, startAdmin) + newAdmin + s.slice(endAdmin);
  console.log("LAYOUT_ADMIN patché");
} else {
  console.log("LAYOUT_ADMIN déjà à jour");
}

/* 2. LAYOUT_DRIVER → description + appleWebApp */
if (!s.includes('title: "Espace livreur",')) {
  const oldDriverMeta = nl(`export const metadata: Metadata = {
  title: {
    default: "Espace livreur",
    template: "%s | Espace livreur",
  },
  robots: { index: false, follow: false },
};`);
  const newDriverMeta = nl(`export const metadata: Metadata = {
  title: {
    default: "Espace livreur",
    template: "%s | Espace livreur",
  },
  description:
    "Espace livreur ISF NAF-CHOPOP : livraisons, statuts et suivi en temps réel.",
  applicationName: "Espace livreur ISF NAF-CHOPOP",
  appleWebApp: {
    capable: true,
    title: "Espace livreur",
    statusBarStyle: "default",
  },
  robots: { index: false, follow: false },
};`);
  if (!s.includes(oldDriverMeta)) throw new Error("métadonnées LAYOUT_DRIVER introuvables");
  s = s.replace(oldDriverMeta, newDriverMeta);
  console.log("LAYOUT_DRIVER patché");
} else {
  console.log("LAYOUT_DRIVER déjà à jour");
}

/* 3. Manifests dédiés admin/driver (templates) */
if (!s.includes("const MANIFEST_ADMIN")) {
  const templates = nl(`/** Manifest dédié \`admin\` : pas de page \`/\` dans cette app. */
const MANIFEST_ADMIN = \`import type { MetadataRoute } from "next";

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
\`;

/** Manifest dédié \`driver\` : pas de page \`/\` dans cette app. */
const MANIFEST_DRIVER = \`import type { MetadataRoute } from "next";

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
\`;

`);
  const i = s.indexOf("const LAYOUT_ADMIN = `");
  if (i < 0) throw new Error("ancre MANIFEST introuvable");
  s = s.slice(0, i) + templates + s.slice(i);
  console.log("templates MANIFEST ajoutés");
} else {
  console.log("MANIFEST déjà présent");
}

/* 4. Config apps : manifest dédié */
if (!s.includes('layout: "admin"')) throw new Error("config admin introuvable");
if (!s.includes('manifest: "admin"')) {
  s = s.replace('layout: "admin",', nl('layout: "admin",\n    manifest: "admin",'));
  console.log("config admin manifest ajoutée");
}
if (!s.includes('manifest: "driver"')) {
  s = s.replace('layout: "driver",', nl('layout: "driver",\n    manifest: "driver",'));
  console.log("config driver manifest ajoutée");
}

/* 5. Émission : manifest dédié plutôt que ré-export */
const oldEmit = nl(`  for (const rootRoute of config.rootRoutes) {
    if (existsSync(join(ROOT, "app", rootRoute))) emit(rootRoute);
  }`);
const newEmit = nl(`  for (const rootRoute of config.rootRoutes) {
    if (!existsSync(join(ROOT, "app", rootRoute))) continue;
    // Manifest dédié par application (start_url propre, pas de page /).
    if (rootRoute === "manifest.ts" && config.manifest) {
      const content =
        config.manifest === "admin" ? MANIFEST_ADMIN : MANIFEST_DRIVER;
      writeFile(join(appDir, "app", "manifest.ts"), content);
      routes += 1;
      continue;
    }
    emit(rootRoute);
  }`);
if (!s.includes(newEmit)) {
  if (!s.includes(oldEmit)) throw new Error("boucle rootRoutes introuvable");
  s = s.replace(oldEmit, newEmit);
  console.log("boucle rootRoutes patchée");
} else {
  console.log("boucle rootRoutes déjà à jour");
}

writeFileSync(path, s, "utf8");
console.log("generate-apps.mjs écrit");
