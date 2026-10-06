import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { logger } from "@/lib/observability/logger";

/**
 * Collecte de visites publiques.
 *
 * Volontairement minimaliste : chemin, identifiant de session rotatif, et
 * booléen d'authentification. Aucune IP, aucune donnée personnelle. La table
 * n'accepte aucune lecture depuis le navigateur (RLS).
 */

export const dynamic = "force-dynamic";

const trackSchema = z.object({
  path: z.string().trim().min(1).max(500),
  sessionId: z.string().trim().min(8).max(64),
  authenticated: z.boolean().default(false),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = trackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const path = parsed.data.path;
  if (path.startsWith("/admin") || path.startsWith("/api")) {
    return NextResponse.json({ ok: true });
  }

  try {
    const supabase = await createAdminClient();
    const { error } = await supabase.from("site_visits").insert({
      path,
      session_id: parsed.data.sessionId,
      authenticated: parsed.data.authenticated,
    });
    if (error) {
      logger.warn("track: insertion refusée", { error: error.message });
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  } catch (error) {
    logger.warn("track: échec", { error: String(error) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
