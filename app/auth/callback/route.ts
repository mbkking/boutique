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

  const { error, data } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const fallback = new URL("/connexion", url.origin);
    fallback.searchParams.set("erreur", "lien-expire");
    return NextResponse.redirect(fallback);
  }

  // Première connexion (ex. OAuth) : créer la fiche client manquante.
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const admin = await createAdminClient();
    const user = data?.user;
    if (user) {
      const { data: profile } = await admin
        .from("profiles")
        .select("id, full_name, phone")
        .eq("id", user.id)
        .maybeSingle();
      if (profile) {
        const { data: existing } = await admin.from("customers").select("id").eq("profile_id", profile.id).limit(1);
        if (!existing || existing.length === 0) {
          const { data: byPhone } = await admin.from("customers").select("id").eq("phone", profile.phone).limit(1);
          if (byPhone && byPhone.length > 0) {
            await admin.from("customers").update({ profile_id: profile.id }).eq("id", byPhone[0].id);
          } else {
            await admin.from("customers").insert({ profile_id: profile.id, full_name: profile.full_name, phone: profile.phone });
          }
        }
      }
    }
  } catch {
    // La fiche client est décorrélée : un prochain accès / compte la rétablira.
  }

  return response;
}
