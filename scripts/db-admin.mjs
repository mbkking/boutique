/**
 * Exécution de SQL sur la base Supabase distante.
 *
 * Le jeton d'accès n'est jamais demandé ni affiché dans une conversation : il
 * est lu, soit dans la variable d'environnement `SUPABASE_ACCESS_TOKEN`, soit
 * dans le fichier que le CLI Supabase écrit lui-même lors de `supabase login`
 * (`~/.supabase/access-token`). Il n'est écrit dans aucun fichier du dépôt et
 * n'est jamais imprim��.
 *
 * Prérequis : `npx supabase login` (le CLI ouvre le navigateur, la saisie se
 * fait dans le navigateur, pas ici).
 *
 * Usage :
 *   node scripts/db-admin.mjs diagnostics
 *   node scripts/db-admin.mjs apply supabase/migrations/025_driver_order_read.sql
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "hccolumwehlzeakogglg";

/** Jeton lu depuis l'environnement ou le fichier du CLI. Jamais affiché. */
function accessToken() {
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const cliFile = join(homedir(), ".supabase", "access-token");
  if (!existsSync(cliFile)) {
    throw new Error(
      "Aucun accès SQL : lancez `npx supabase login` (le jeton est alors stocké par le CLI, " +
        "rien n'est à coller dans une conversation)."
    );
  }

  const token = readFileSync(cliFile, "utf8").trim();
  if (!token) throw new Error("Fichier de jeton vide : relancez `npx supabase login`.");

  return token;
}

async function runSql(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  const text = await response.text();

  if (!response.ok) {
    // La réponse ne contient jamais le jeton : elle peut être affichée telle quelle.
    throw new Error(`SQL refusé (${response.status}) : ${text}`);
  }

  return JSON.parse(text);
}

const DIAGNOSTICS = `
-- 1. Tables réellement publiées dans le canal Realtime.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- 2. RLS activé ?
select c.relname as table, c.relrowsecurity as rls_actif
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('orders','order_items','deliveries','delivery_events','notifications')
order by c.relname;

-- 3. Policies réelles sur les tables du flux temps réel.
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('orders','order_items','deliveries','delivery_events','notifications')
order by tablename, cmd, policyname;
`;

const command = process.argv[2];

try {
  if (command === "diagnostics") {
    const result = await runSql(DIAGNOSTICS);
    const [publication, rls, policies] = result;

    console.log("--- 1. Tables publiées dans supabase_realtime");
    console.log(publication.map((row) => `  ${row.tablename}`).join("\n") || "  (aucune)");

    console.log("");
    console.log("--- 2. RLS par table");
    console.log(rls.map((row) => `  ${row.table}: ${row.rls_actif ? "actif" : "INACTIF"}`).join("\n"));

    console.log("");
    console.log("--- 3. Policies (commande / rôles / condition)");
    for (const policy of policies) {
      const condition = (policy.qual ?? "").replace(/\s+/g, " ").trim();
      console.log(`  ${policy.tablename} | ${policy.policyname} | ${policy.cmd} | ${policy.roles}`);
      console.log(`      ${condition}`);
    }
  } else if (command === "apply") {
    const file = process.argv[3];
    if (!file) throw new Error("Usage : node scripts/db-admin.mjs apply <fichier.sql>");

    const sql = readFileSync(file, "utf8");
    const result = await runSql(sql);

    console.log(`Appliqué : ${file}`);
    console.log(`Instructions exécutées : ${Array.isArray(result) ? result.length : 1}`);

    // Vérification réelle : on relit les policies après application.
    const verify = await runSql(
      `select tablename, policyname, cmd from pg_policies
       where schemaname = 'public'
         and policyname in ('orders_select_driver','order_items_select_driver')
       order by tablename;`
    );

    console.log("");
    console.log("Vérification (lecture après application) :");
    if (verify.length === 0) {
      console.log("  AUCUNE policy trouvée — la migration n'a pas pris effet.");
      process.exitCode = 1;
    } else {
      for (const row of verify) {
        console.log(`  ${row.tablename} | ${row.policyname} | ${row.cmd}`);
      }
    }
  } else {
    console.log("Usage : node scripts/db-admin.mjs diagnostics | apply <fichier.sql>");
  }
} catch (error) {
  console.log(`ERREUR : ${error.message}`);
  process.exitCode = 1;
}