/**
 * Configuration publique de l'application **racine** (application unique
 * conservée pour le développement historique).
 *
 * Les trois applications indépendantes (`apps/client`, `apps/admin`,
 * `apps/driver`) possèdent chacune leur propre fichier généré
 * `lib/app-config.ts`, avec leur URL et leur portée de session.
 *
 * Pourquoi un fichier plutôt que des variables `NEXT_PUBLIC_*` ? Le code
 * partagé (composants, clients Supabase) vit à la racine du dépôt, donc **hors
 * du dossier de chaque application** : Next.js n'y inline pas les variables
 * d'environnement, et le premier rendu client échouerait. Une constante
 * TypeScript est en revanche résolue normalement, dans les deux runtimes.
 *
 * Seules des valeurs **publiques** figurent ici. La clé de service reste
 * lisible uniquement par le serveur, via `process.env`.
 */

function readEnv(name: string): string {
  return process.env[name] ?? "";
}

export const PUBLIC_CONFIG = {
  /** URL du projet Supabase (public). */
  supabaseUrl: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
  /** Clé anonyme Supabase (public). */
  supabaseAnonKey: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  /** URL publique de l'application. */
  appUrl: readEnv("NEXT_PUBLIC_APP_URL") || "http://localhost:3000",
  /**
   * Portée de session : détermine le nom du cookie, donc l'isolation entre
   * applications. L'application racine reste sur la portée `client`.
   */
  sessionScope: "client" as const,
} as const;