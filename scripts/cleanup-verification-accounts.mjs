/**
 * Supprime les comptes créés par les scripts de vérification
 * (`*@example.test`, adresses de test générées).
 *
 * Les comptes réels du projet ne sont jamais concernés.
 *
 * Usage : node scripts/cleanup-verification-accounts.mjs
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const PATTERNS = [
  /@example\.test$/i,
  /^nouveau\.client\./i,
  /^theme-check-/i,
  /^appearance-check-/i,
  /^product-check-/i,
  /^user-admin-/i,
];

async function listAuthUsers() {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error("Listage impossible :", error.message);
    process.exit(1);
  }
  return data.users;
}

let removed = 0;

// La suppression d'un utilisateur ne modifie pas la page courante renvoyée par
// l'API : on repasse donc la liste après chaque vague.
for (let round = 0; round < 5; round += 1) {
  const users = await listAuthUsers();
  const targets = users.filter((user) =>
    PATTERNS.some((pattern) => pattern.test(user.email ?? ""))
  );

  if (targets.length === 0) break;

  for (const user of targets) {
    // `audit_logs.actor_id` référence `profiles` sans `ON DELETE CASCADE` :
    // sans ce nettoyage préalable, la suppression du compte échoue avec
    // « Database error deleting user ».
    await supabase.from("audit_logs").delete().eq("actor_id", user.id);
    await supabase.from("inventory_movements").delete().eq("created_by", user.id);
    await supabase.from("delivery_events").delete().eq("created_by", user.id);
    await supabase.from("notifications").delete().eq("user_id", user.id);
    await supabase.from("carts").delete().eq("user_id", user.id);

    const result = await supabase.auth.admin.deleteUser(user.id);

    if (result.error) {
      console.error(`échec pour ${user.email} :`, result.error.message);
      continue;
    }

    removed += 1;
    console.log("supprimé :", user.email);
  }
}

// Les profils ne sont pas supprimés en cascade par l'authentification : les
// profils de vérification orphelins disparaissent aussi, sans quoi ils
// continueraient d'apparaître dans l'écran Utilisateurs.
const authIds = new Set((await listAuthUsers()).map((user) => user.id));
const { data: profiles } = await supabase.from("profiles").select("id, full_name");
let orphans = 0;

for (const profile of profiles ?? []) {
  if (authIds.has(profile.id)) continue;
  await supabase.from("profiles").delete().eq("id", profile.id);
  orphans += 1;
}

console.log(`${removed} compte(s) de vérification supprimé(s).`);
console.log(`${orphans} profil(s) orphelin(s) supprimé(s).`);

const remaining = await listAuthUsers();
console.log("Comptes restants :", remaining.map((user) => user.email).join(", "));