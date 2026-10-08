#!/usr/bin/env node
/**
 * B6 — Nettoyage des données de test/E2E/probe en production.
 *
 * Usage :
 *   node --env-file=.env.local scripts/cleanup-test-data.mjs           # DRY-RUN (défaut)
 *   node --env-file=.env.local scripts/cleanup-test-data.mjs --apply   # suppression réelle
 *
 * Sûr :
 * - ne supprime jamais de commande, client, livraison, paiement ;
 * - ignore les produits/catégories/coupons/promotions liés à un historique ;
 * - n'est jamais exécuté automatiquement.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const apply = process.argv.includes("--apply");
const env = {};
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TEST_RE = /e2e|test|probe|repro|qa[-_.]?audit|demo|tmp/i;

function isTestName(s) { return s != null && TEST_RE.test(String(s)); }

async function countTable(table, column, value) {
  const { count } = await sb.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  return count ?? 0;
}

const report = { mode: apply ? "APPLY" : "DRY-RUN", candidates: [], deleted: [], skipped: [], preserved: [] };

// ---------- PRODUITS ----------
{
  const { data: products } = await sb.from("products").select("id,name,slug,is_active,created_at");
  for (const p of products ?? []) {
    if (!isTestName(p.name) && !isTestName(p.slug)) continue;
    // order_items référence variant, pas product : on vérifie via variants
    const { data: variants } = await sb.from("product_variants").select("id").eq("product_id", p.id);
    let blocked = false;
    for (const v of variants ?? []) {
      const [oi, mv, ci] = await Promise.all([
        countTable("order_items", "variant_id", v.id),
        countTable("inventory_movements", "variant_id", v.id),
        countTable("cart_items", "variant_id", v.id),
      ]);
      if (oi + mv + ci > 0) blocked = true;
    }
    report.candidates.push({ table: "products", id: p.id, name: p.name, created_at: p.created_at, reason: "nom/slug de test", blocked, action: blocked ? "SKIP (historique)" : "DELETE" });
    if (blocked) report.skipped.push(`products:${p.slug}`);
    else if (apply) {
      const { error } = await sb.from("products").delete().eq("id", p.id);
      if (error) { report.skipped.push(`products:${p.slug} (erreur: ${error.message})`); } else { report.deleted.push(`products:${p.slug}`); }
    }
  }
}

// ---------- CATÉGORIES ----------
{
  const { data: categories } = await sb.from("categories").select("id,name,slug,created_at");
  for (const c of categories ?? []) {
    if (!isTestName(c.name) && !isTestName(c.slug)) continue;
    const { count } = await sb.from("products").select("id", { count: "exact", head: true }).eq("category_id", c.id);
    const blocked = (count ?? 0) > 0;
    report.candidates.push({ table: "categories", id: c.id, name: c.name, created_at: c.created_at, reason: "nom/slug de test", blocked, action: blocked ? "SKIP (produits restants)" : "DELETE" });
    if (blocked) report.skipped.push(`categories:${c.slug}`);
    else if (apply) {
      const { error } = await sb.from("categories").delete().eq("id", c.id);
      if (error) { report.skipped.push(`categories:${c.slug} (erreur: ${error.message})`); } else { report.deleted.push(`categories:${c.slug}`); }
    }
  }
}

// ---------- COUPONS ----------
{
  const { data: coupons } = await sb.from("coupons").select("id,code,description,created_at,used_count");
  for (const c of coupons ?? []) {
    if (!isTestName(c.code) && !isTestName(c.description)) continue;
    const blocked = (c.used_count ?? 0) > 0;
    report.candidates.push({ table: "coupons", id: c.id, name: c.code, created_at: c.created_at, reason: "code/description de test", blocked, action: blocked ? "SKIP (utilisé)" : "DELETE" });
    if (blocked) report.skipped.push(`coupons:${c.code}`);
    else if (apply) {
      const { error } = await sb.from("coupons").delete().eq("id", c.id);
      if (error) { report.skipped.push(`coupons:${c.code} (erreur: ${error.message})`); } else { report.deleted.push(`coupons:${c.code}`); }
    }
  }
}

// ---------- PROMOTIONS ----------
{
  const { data: promos } = await sb.from("promotions").select("id,name,created_at");
  for (const p of promos ?? []) {
    if (!isTestName(p.name)) continue;
    report.candidates.push({ table: "promotions", id: p.id, name: p.name, created_at: p.created_at, reason: "nom/description de test", blocked: false, action: "DELETE" });
    if (apply) {
      const { error } = await sb.from("promotions").delete().eq("id", p.id);
      if (error) { report.skipped.push(`promotions:${p.name} (erreur: ${error.message})`); } else { report.deleted.push(`promotions:${p.name}`); }
    }
  }
}

// ---------- UTILISATEURS DE TEST (rapportés, non supprimés par défaut) ----------
{
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of users?.users ?? []) {
    const isTestEmail = /e2e|test|probe|qa|exemple\.ne|aaaaa/i.test(u.email ?? "");
    const { data: profile } = await sb.from("profiles").select("role").eq("id", u.id).maybeSingle();
    if (isTestEmail && profile?.role === "customer") {
      report.preserved.push(`utilisateur test NON supprimé: ${u.email} (${profile?.role})`);
    }
  }
}

console.log(JSON.stringify(report, null, 2));
const outDir = "scripts/audit-results";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/cleanup-test-data-${apply ? "apply" : "dryrun"}.json`, JSON.stringify(report, null, 2));
