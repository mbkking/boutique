#!/usr/bin/env node
/**
 * Régularisation B2 — comptes clients bloqués par le rate limit email (2026-10-06).
 *
 * Usage :
 *   node --env-file=.env.local scripts/regularize-b2-accounts.mjs        # DRY-RUN (défaut)
 *   node --env-file=.env.local scripts/regularize-b2-accounts.mjs --apply # application réelle
 *
 * Sûr : ne touche jamais aux admin/driver, ne modifie pas les rôles,
 * ne réinitialise aucun mot de passe, ne supprime rien.
 */
import { createClient } from "@supabase/supabase-js";
import { selectAffectedAccounts } from "../lib/admin/regularize-b2.ts";

const apply = process.argv.includes("--apply");

for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[key]) {
    console.error(`Variable manquante : ${key} (lancez avec --env-file=.env.local)`);
    process.exit(1);
  }
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: users, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) { console.error(error.message); process.exit(1); }

const snapshots = [];
for (const u of users.users) {
  const { data: profile } = await sb.from("profiles").select("role, is_active").eq("id", u.id).maybeSingle();
  snapshots.push({
    id: u.id,
    email: u.email,
    role: profile?.role ?? null,
    isActive: profile?.is_active ?? null,
    emailConfirmedAt: u.email_confirmed_at ?? null,
    createdAt: u.created_at,
  });
}

const targets = selectAffectedAccounts(snapshots);
console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"} — ${targets.length} compte(s) à régulariser\n`);

for (const t of targets) {
  console.log(`- ${t.email} | rôle=${t.role} | confirmé=${t.emailConfirmedAt ? "oui" : "non"} | actif=${t.isActive} | raison=${t.reason} | actions=${t.actions.join(", ")}`);
  if (!apply) continue;

  for (const action of t.actions) {
    if (action === "confirm_email") {
      const { error: e } = await sb.auth.admin.updateUserById(t.id, { email_confirm: true });
      console.log(`   -> email confirmé: ${e ? "ERREUR " + e.message : "ok"}`);
    }
    if (action === "activate_profile") {
      const { error: e } = await sb.from("profiles").update({ is_active: true, updated_at: new Date().toISOString() }).eq("id", t.id);
      console.log(`   -> profil activé: ${e ? "ERREUR " + e.message : "ok"}`);
    }
  }
}

console.log("\nTerminé." + (apply ? "" : " Aucun changement appliqué."));
