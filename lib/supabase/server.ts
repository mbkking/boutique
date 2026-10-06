import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sessionCookieOptions } from "@/lib/supabase/session-cookie";
import { PUBLIC_CONFIG } from "@app-config/env";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name}. Copiez .env.example vers .env.local et renseignez-la.`
    );
  }
  return value;
}

/**
 * Valeur publique requise.
 *
 * Elle provient du fichier de configuration de l'application
 * (`lib/app-config.ts`), généré avec elle : le code partagé vit hors du dossier
 * de chaque application, et Next.js n'y inline pas les variables
 * `NEXT_PUBLIC_*`. L'environnement reste la source quand il est renseigné
 * (déploiements, tests), la configuration générée sert de repli.
 */
function publicEnv(name: "supabaseUrl" | "supabaseAnonKey"): string {
  const value = process.env[name] ?? PUBLIC_CONFIG[name];

  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name}. Copiez .env.example vers .env.local et renseignez-la.`
    );
  }

  return value;
}
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv("supabaseUrl"),
    publicEnv("supabaseAnonKey"),
    {
      // Nom propre à l'application : sans cela, les sessions admin et livreur
      // s'écraseraient mutuellement (les cookies sont partagés par hôte, pas
      // par port).
      cookieOptions: sessionCookieOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Appelé depuis un Server Component : ignoré, le middleware rafraîchit la session.
          }
        },
      },
    }
  );
}

/**
 * Client privilégié (service role) réservé aux opérations serveur sensibles.
 * Ne doit JAMAIS être importé depuis un composant client ni exposé au navigateur.
 */
export async function createAdminClient() {
  const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");

  return createSupabaseClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

export type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
export type SupabaseAdminClient = Awaited<ReturnType<typeof createAdminClient>>;
