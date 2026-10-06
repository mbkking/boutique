/**
 * Génère les trois applications indépendantes : `apps/client`, `apps/admin`,
 * `apps/driver`.
 *
 * Principe : **rien n'est dupliqué**. Chaque route d'application est un
 * ré-export du fichier source conservé à la racine du dépôt, résolu par
 * l'alias `@repo/*`. Chaque application possède :
 *
 *   - son dossier (donc son contexte Next : pas de verrouillage partagé) ;
 *   - son `middleware.ts` (garde de rôle propre) ;
 *   - son `.env.local` (URL et portée de session) ;
 *   - ses assets publics (PWA, images).
 *
 * Usage : node scripts/generate-apps.mjs
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = process.cwd();

/** Fichiers de routage Next : seuls ceux-ci sont ré-exportés. */
const ROUTE_FILES = new Set([
  "page.tsx",
  "layout.tsx",
  "loading.tsx",
  "not-found.tsx",
  "error.tsx",
  "global-error.tsx",
  "robots.ts",
  "sitemap.ts",
  "manifest.ts",
  "route.ts",
]);

const APPS = {
  client: {
    port: 3000,
    space: "client",
    groups: ["(store)", "(account)", "auth"],
    extra: [
      "about",
      "conditions-de-vente",
      "connexion",
      "contact",
      "espace-indisponible",
      "inscription",
      "mot-de-passe-oublie",
      "politique-de-confidentialite",
      "politique-de-retour",
      "reinitialiser-mot-de-passe",
    ],
    api: ["api/track"],
    rootRoutes: ["robots.ts", "sitemap.ts", "manifest.ts"],
    layout: "store",
    label: "Boutique client",
  },
  admin: {
    port: 3002,
    space: "admin",
    groups: ["(admin)"],
    extra: ["connexion", "espace-indisponible", "mot-de-passe-oublie", "reinitialiser-mot-de-passe"],
    api: ["api/admin"],
    rootRoutes: ["robots.ts", "manifest.ts"],
    layout: "admin",
    label: "Administration",
  },
  driver: {
    port: 3003,
    space: "driver",
    groups: ["(delivery)", "(livreur)"],
    extra: ["connexion", "espace-indisponible", "mot-de-passe-oublie", "reinitialiser-mot-de-passe"],
    api: [],
    rootRoutes: ["robots.ts", "manifest.ts"],
    layout: "driver",
    label: "Espace livreur",
  },
};

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (ROUTE_FILES.has(entry.name)) out.push(relative(base, full));
  }

  return out;
}

/** Analyse un fichier `.env*` (format `CLE=valeur`). */
function parseEnv(content) {
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

/**
 * Fichiers de route obligatoirement côté client.
 *
 * Un simple ré-export ne peut pas porter la directive `use client` du module
 * d'origine : la déclaration doit être réécrite dans le fichier généré.
 */
const CLIENT_ROUTE_FILES = new Set(["error.tsx", "global-error.tsx"]);

/** Ré-export d'une route partagée. */
function reexportContent(relativePath, appName) {
  const target = `@repo/app/${relativePath.split("\\").join("/")}`.replace(
    /\.(tsx|ts)$/,
    ""
  );

  const directive = CLIENT_ROUTE_FILES.has(relativePath) ? '"use client";\n\n' : "";

  return `${directive}/**
 * Route de l'application \`${appName}\`, ré-exportée depuis le code partagé.
 *
 * Source : \`${relativePath}\` (dépôt racine).
 *
 * Aucun code métier n'est dupliqué : l'application ne fait que déclarer
 * qu'elle sert cette route, avec son propre contexte Next.
 */
export * from "${target}";
${
  // Un gestionnaire de route (`route.ts`) n'expose que des méthodes nommées
  // (`GET`, `POST`…) : il n'a pas d'export par défaut à ré-exporter.
  relativePath.endsWith("route.ts")
    ? ""
    : `export { default } from "${target}";`
}
`;
}

/* ------------------------------------------------------------------ */
/* Gabarits par application                                            */
/* ------------------------------------------------------------------ */

const PACKAGE_JSON = (name, port, label) =>
  JSON.stringify(
    {
      name: `@boutique/${name}`,
      version: "0.1.0",
      private: true,
      description: `${label} — application Next.js indépendante (contexte propre).`,
      scripts: {
        dev: `node ../../scripts/run-app.mjs ${name} ${port}`,
        build: `node ../../scripts/run-app.mjs ${name} ${port} build`,
        start: `node ../../scripts/run-app.mjs ${name} ${port} start`,
        typecheck: "tsc --noEmit",
        lint: "eslint",
      },
    },
    null,
    2
  ) + "\n";

const NEXT_CONFIG = (space, port) => `import type { NextConfig } from "next";\nimport { fileURLToPath } from "node:url";\nimport { existsSync, readFileSync } from "node:fs";\n\n/**\n * Lecture explicite du fichier d'environnement de l'application.\n *\n * \\'next.config.ts\\' est évalué **avant** que Next.js ne charge les fichiers\n * \\'.env\\' : sans cette lecture, les variables publiques seraient vides au\n * moment de leur déclaration dans \\'env\\', donc vides dans les bundles\n * navigateur — et les composants clients échoueraient au premier rendu.\n */\nfunction readAppEnv(): Record<string, string> {\n  const path = fileURLToPath(new URL("./.env.local", import.meta.url));\n  if (!existsSync(path)) return {};\n\n  return Object.fromEntries(\n    readFileSync(path, "utf8")\n      .split(/\\\\r?\\\\n/)\n      .filter((line) => line.trim() && !line.trim().startsWith("#"))\n      .map((line) => {\n        const index = line.indexOf("=");\n        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];\n      })\n  );\n}\n\nconst appEnv = readAppEnv();

/**
 * Configuration de l'application \`${space}\`.
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
`;

const TSCONFIG = (name) =>
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: {
          // Code partagé à la racine du dépôt.
          "@repo/*": ["../../*"],
          // Configuration publique propre à cette application.
          "@app-config/env": ["./lib/app-config.ts"],
          // Alias historique du projet : `@/lib/...` continue de fonctionner.
          "@/*": ["../../*"],
        },
      },
      include: [
        "next-env.d.ts",
        "**/*.ts",
        "**/*.tsx",
        ".next/types/**/*.ts",
        "../../types/**/*.ts",
      ],
      exclude: ["node_modules", ".next"],
    },
    null,
    2
  ) + "\n";

const PROXY = (space, label) => `import { createAppMiddleware } from "@repo/lib/auth/app-middleware";

/**
 * Garde de l'application \`${space}\` — ${label}.
 *
 * Le rôle est lu en base à chaque requête protégée : un client qui saisit
 * manuellement une URL d'administration est refusé, et une session admin ne
 * peut pas être réutilisée sur un autre port (nom de cookie propre).
 */
export const proxy = createAppMiddleware("${space}");

/**
 * Chemins non couverts par le proxy : fichiers statiques et assets.
 *
 * Objet statique : Next.js le lit au build, il ne peut pas être
 * construit à l'exécution.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
`;

const LAYOUT_STORE = `import RootLayout from "@repo/app/layout";

/**
 * Layout racine de l'application client.
 *
 * Le layout racine du dépôt (en-tête, pied de page, panier, PWA) est
 * réutilisé tel quel : l'application client n'en est qu'une instance avec son
 * propre contexte Next et sa propre session.
 */
export default RootLayout;
`;

const LAYOUT_ADMIN = `import type { Metadata, Viewport } from "next";

import "@repo/app/globals.css";
import { Providers } from "@repo/components/layout/providers";

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
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
`;

const LAYOUT_DRIVER = `import type { Metadata, Viewport } from "next";

import "@repo/app/globals.css";
import { Providers } from "@repo/components/layout/providers";
import { ServiceWorkerRegistrar } from "@repo/components/layout/service-worker-registrar";

/**
 * Layout racine de l'application livreur.
 *
 * Sans l'en-tête ni le pied de page de la boutique : l'espace livreur a sa
 * propre coque, pensée pour le terrain. Cette application ne sert que des
 * routes \`/livreur/*\` et \`/driver/*\`.
 */
export const metadata: Metadata = {
  title: {
    default: "Espace livreur",
    template: "%s | Espace livreur",
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

export default function DriverRootLayout({ children }: { children: React.ReactNode }) {
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
`;

/** Variables d'environnement propres à une application. */
function envFile(appName, config) {
  const base = readFileSync(join(ROOT, ".env.local"), "utf8");
  const filtered = base
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#"))
    .filter((line) => !/^NEXT_PUBLIC_APP_URL=/.test(line))
    .filter((line) => !/^NEXT_PUBLIC_SESSION_SCOPE=/.test(line));

  const header = [
    `# ${config.label} — variables d'environnement (application ${appName}).`,
    "# Mêmes projet Supabase que les autres applications ; seul le port, l'URL",
    "# publique et la portée de session changent. Les secrets restent côté serveur.",
  ].join("\n");

  return `${header}\n${filtered.join("\n")}\nNEXT_PUBLIC_APP_URL=http://localhost:${config.port}\nNEXT_PUBLIC_SESSION_SCOPE=${config.space}\n`;
}

/* ------------------------------------------------------------------ */
/* Génération                                                          */
/* ------------------------------------------------------------------ */

for (const [name, config] of Object.entries(APPS)) {
  const appDir = join(ROOT, "apps", name);

  // Régénération complète : tout ce qui est ici est produit par ce script.
  rmSync(appDir, { recursive: true, force: true });
  mkdirSync(join(appDir, "app"), { recursive: true });

  let routes = 0;

  const emit = (relativePath) => {
    writeFile(join(appDir, "app", relativePath), reexportContent(relativePath, name));
    routes += 1;
  };

  for (const group of config.groups) {
    for (const file of walk(join(ROOT, "app", group))) emit(join(group, file));
  }

  for (const extra of config.extra) {
    for (const file of walk(join(ROOT, "app", extra))) emit(join(extra, file));
  }

  for (const api of config.api) {
    for (const file of walk(join(ROOT, "app", api))) emit(join(api, file));
  }

  for (const rootRoute of config.rootRoutes) {
    if (existsSync(join(ROOT, "app", rootRoute))) emit(rootRoute);
  }

  // Fichiers racine applicatifs (404, erreurs) : repris depuis la racine.
  for (const shared of ["not-found.tsx", "error.tsx", "loading.tsx"]) {
    if (!existsSync(join(ROOT, "app", shared))) continue;

    const modulePath = `@repo/app/${shared.replace(/\.tsx$/, "")}`;
    // `error.tsx` est obligatoirement un composant client : la directive doit
    // être dans le fichier généré, un ré-export ne la transporte pas.
    const directive = CLIENT_ROUTE_FILES.has(shared) ? '"use client";\n\n' : "";

    writeFile(
      join(appDir, "app", shared),
      `${directive}export * from "${modulePath}";\nexport { default } from "${modulePath}";\n`
    );
    routes += 1;
  }

  // Layout racine propre à l'application.
  const layout =
    config.layout === "store"
      ? LAYOUT_STORE
      : config.layout === "admin"
        ? LAYOUT_ADMIN
        : LAYOUT_DRIVER;

  writeFile(join(appDir, "app", "layout.tsx"), layout);

  // Configuration publique de l'application : valeurs publiques résolues par le
  // code partagé, sans dépendre de l'inlining des variables d'environnement
  // (le code partagé vit hors du dossier de l'application, Next.js n'y inline
  // donc pas les variables `NEXT_PUBLIC_*`).
  const appEnv = parseEnv(readFileSync(join(ROOT, ".env.local"), "utf8"));

  writeFile(
    join(appDir, "lib", "app-config.ts"),
    `/**
 * Configuration publique de l'application \`${name}\` — ${config.label}.
 *
 * Généré par \`scripts/generate-apps.mjs\` : ne pas modifier à la main.
 *
 * Ces valeurs sont publiques par nature (elles voyagent dans le navigateur).
 * La clé de service n'apparaît jamais ici : elle reste lisible uniquement par
 * le serveur, via \`process.env\`.
 */
export const PUBLIC_CONFIG = {
  supabaseUrl: ${JSON.stringify(appEnv.NEXT_PUBLIC_SUPABASE_URL ?? "")},
  supabaseAnonKey: ${JSON.stringify(appEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "")},
  appUrl: ${JSON.stringify(`http://localhost:${config.port}`)},
  sessionScope: ${JSON.stringify(config.space)} as const,
} as const;
`
  );

  // Configuration, middleware, TypeScript.
  writeFile(join(appDir, "package.json"), PACKAGE_JSON(name, config.port, config.label));
  writeFile(join(appDir, "next.config.ts"), NEXT_CONFIG(config.space, config.port));
  writeFile(join(appDir, "tsconfig.json"), TSCONFIG(name));
  writeFile(
    join(appDir, "next-env.d.ts"),
    '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n'
  );
  writeFile(join(appDir, "proxy.ts"), PROXY(config.space, config.label));
  writeFile(join(appDir, ".env.local"), envFile(name, config));
  writeFile(
    join(appDir, ".env.example"),
    `# ${config.label}\nNEXT_PUBLIC_APP_URL=http://localhost:${config.port}\nNEXT_PUBLIC_SESSION_SCOPE=${config.space}\nNEXT_PUBLIC_SUPABASE_URL=\nNEXT_PUBLIC_SUPABASE_ANON_KEY=\nSUPABASE_SERVICE_ROLE_KEY=\n`
  );

  // Assets publics : PWA, icônes, images.
  cpSync(join(ROOT, "public"), join(appDir, "public"), { recursive: true });

  // eslintignore : les fichiers générés sont des ré-exports.
  writeFile(
    join(appDir, "eslint.config.mjs"),
    `import baseConfig from "../../eslint.config.mjs";

/**
 * Lint de l'application \`${name}\`. La configuration racine s'applique telle
 * quelle : les règles sont celles du dépôt, pas une variante par application.
 */
export default [...baseConfig, { ignores: ["**/.next/**", "**/node_modules/**"] }];
`
  );

  console.log(`${name} (${config.label}) : ${routes} route(s), port ${config.port}.`);
}

console.log("Génération terminée.");
