import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSafeReturnTo } from "@/lib/auth/redirect";

/**
 * Retour des liens e-mail Supabase Auth (confirmation, récupération).
 *
 * Échange le `code` contre une session, puis redirige vers la destination
 * `next` — validée contre les redirections ouvertes, avec un repli sûr.
 * Sans code valide, renvoi vers la connexion avec un message.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");

  const destination =
    next && isSafeReturnTo(next) ? next : "/reinitialiser-mot-de-passe";

  const redirectUrl = new URL(destination, url.origin);

  if (!code) {
    redirectUrl.pathname = "/connexion";
    redirectUrl.searchParams.set("erreur", "lien-invalide");
    return NextResponse.redirect(redirectUrl);
  }

  const response = NextResponse.redirect(redirectUrl);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const fallback = new URL("/connexion", url.origin);
    fallback.searchParams.set("erreur", "lien-expire");
    return NextResponse.redirect(fallback);
  }

  return response;
}
