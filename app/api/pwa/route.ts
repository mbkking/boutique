import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { logger } from "@/lib/observability/logger";

/**
 * Suivi du tunnel d'installation de l'application mobile (PWA).
 *
 * Le client qui arrive par un lien partagé voit une invitation à installer
 * l'application ; on enregistre chaque étape franchie (invitation vue, bouton
 * pressé, installation terminée) pour mesurer le parcours jusqu'à
 * l'installation.
 *
 * Comme la collecte de visites, la table ne se lit pas depuis le navigateur :
 * aucune donnée personnelle n'y est écrite, seulement l'étape et l'identifiant
 * de session rotatif déjà utilisé par le suivi de visites.
 */

export const dynamic = "force-dynamic";

const STEPS = ["shown", "clicked", "installed", "dismissed"] as const;

const pwaSchema = z.object({
  step: z.enum(STEPS),
  sessionId: z.string().trim().min(8).max(64),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = pwaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const supabase = await createAdminClient();
    const { error } = await supabase.from("site_visits").insert({
      path: `pwa:${parsed.data.step}`,
      session_id: parsed.data.sessionId,
      authenticated: false,
    });
    if (error) {
      logger.warn("pwa: suivi refusé", { error: error.message });
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  } catch (error) {
    logger.warn("pwa: suivi impossible", { error: String(error) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
