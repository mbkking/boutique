import { createBrowserClient } from "@supabase/ssr";
import { sessionCookieOptions } from "@/lib/supabase/session-cookie";
import { PUBLIC_CONFIG } from "@app-config/env";

function requiredEnv(name: string): string {
  const value = process.env[name] ?? PUBLIC_CONFIG[name as keyof typeof PUBLIC_CONFIG];
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name}. Copiez .env.example vers .env.local et renseignez-la.`
    );
  }
  return value;
}

/**
 * Client navigateur.
 *
 * Le nom du cookie de session est celui de l'application : c'est ce qui
 * permet d'être connecté simultanément sur la boutique, l'administration et
 * l'espace livreur, sans qu'une session n'écrase l'autre.
 */
export function createClient() {
  return createBrowserClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? PUBLIC_CONFIG.supabaseUrl),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? PUBLIC_CONFIG.supabaseAnonKey),
    { cookieOptions: sessionCookieOptions() }
  );
}