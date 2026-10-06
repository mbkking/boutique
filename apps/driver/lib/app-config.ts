/**
 * Configuration publique de l'application `driver` — Espace livreur.
 *
 * Généré par `scripts/generate-apps.mjs` : ne pas modifier à la main.
 *
 * Ces valeurs sont publiques par nature (elles voyagent dans le navigateur).
 * La clé de service n'apparaît jamais ici : elle reste lisible uniquement par
 * le serveur, via `process.env`.
 */
export const PUBLIC_CONFIG = {
  supabaseUrl: "https://hccolumwehlzeakogglg.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY29sdW13ZWhsemVha29nZ2xnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4OTA3MDMsImV4cCI6MjEwNjQ2NjcwM30.Dck53esV_uNnNbtwiUbmsewXz02545N6tOJkPCrRv_o",
  appUrl: "http://localhost:3003",
  sessionScope: "driver" as const,
} as const;
