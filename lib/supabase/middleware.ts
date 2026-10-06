import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieOptions } from "@/lib/supabase/session-cookie";
import { PUBLIC_CONFIG } from "@app-config/env";

/**
 * Rafraîchit la session et expose le client pour le middleware.
 *
 * Le client est retourné en plus de la réponse pour que l'appelant puisse
 * lire l'utilisateur sans recréer une session (une seule vérification du
 * jeton par requête).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? PUBLIC_CONFIG.supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? PUBLIC_CONFIG.supabaseAnonKey,
    {
      // Même portée de cookie que le reste de l'application : le middleware
      // rafraîchit la bonne session, pas celle d'une autre application.
      cookieOptions: sessionCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // DOIS être appelé : rafraîchit le jeton et synchronise les cookies.
  await supabase.auth.getUser();

  return { response: supabaseResponse, supabase };
}
