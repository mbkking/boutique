/**
 * Remise à zéro de la base distante : supprime toutes les données de
 * transaction et de boutage (commandes, produits, catégories, paniers,
 * coupons, livraisons, notifications, visites, images produits) tout en
 * conservant :
 *   - les comptes (auth.users, profiles, customers, addresses),
 *   - la configuration boutique (app_settings, delivery_zones, rôles).
 *
 * Usage : node scripts/reset-db-data.mjs
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Dans cet ordre (enfants avant parents) pour respecter les clés étrangères. */
const TABLES_TO_CLEAR = [
  "order_status_history",
  "order_items",
  "cash_collections",
  "delivery_events",
  "deliveries",
  "notifications",
  "orders",
  "cart_items",
  "carts",
  "coupon_usages",
  "coupons",
  "promotions",
  "audit_logs",
  "site_visits",
  "inventory_movements",
  "product_images",
  "product_variants",
  "products",
  "categories",
  "products_stock_backup_026",
  "rate_limit_buckets",
];

const TABLES_KEPT = ["profiles", "customers", "addresses", "app_settings", "delivery_zones"];

async function countTable(table) {
  const { count, error } = await sb.from(table).select("id", { count: "exact", head: true }).limit(1);
  if (!error) return count ?? 0;
  const { count: countKey, error: errKey } = await sb
    .from(table)
    .select("key", { count: "exact", head: true })
    .limit(1);
  return errKey ? NaN : (countKey ?? 0);
}

// Filtre de suppression universel : each table has either a uuid `id`
// column, a bigint `id` column (site_visits), or a text `key` column
// (rate_limit_buckets). On essaie dans l'ordre.
async function deleteAll(table) {
  const uuid = await sb.from(table).delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
  if (!uuid.error) return uuid;
  const bigint = await sb.from(table).delete({ count: "exact" }).gte("id", 0);
  if (!bigint.error) return bigint;
  const byKey = await sb.from(table).delete({ count: "exact" }).neq("key", "");
  return byKey;
}

console.log("== AVANT ==");
for (const t of [...TABLES_TO_CLEAR, ...TABLES_KEPT]) {
  console.log(`  ${t.padEnd(28)} ${await countTable(t)}`.replace("NaN ", " ERREUR "));
}

console.log("\n== SUPPRESSION ==");
for (const t of TABLES_TO_CLEAR) {
  const { count, error } = await deleteAll(t);
  if (error) {
    console.log(`  ${t.padEnd(28)} ÉCHEC ${error.message}`);
  } else {
    console.log(`  ${t.padEnd(28)} ${count ?? 0} supprimé(s)`);
  }
}

console.log("\n== STORAGE product-images (sauf branding = thème/conservé) ==");
{
  const { data: root, error } = await sb.storage.from("product-images").list("", { limit: 500 });
  if (error) {
    console.log(`  ÉCHEC liste ${error.message}`);
  } else {
    for (const f of root ?? []) {
      if (f.id === null) {
        if (["branding"].includes(f.name)) continue;
        const { data: sub } = await sb.storage.from("product-images").list(f.name, { limit: 500 });
        for (const g of sub ?? []) {
          await sb.storage.from("product-images").remove([`${f.name}/${g.name}`]);
        }
        await sb.storage.from("product-images").remove([`${f.name}/`]);
      } else {
        await sb.storage.from("product-images").remove([f.name]);
      }
    }
    const { data: remaining } = await sb.storage.from("product-images").list("", { limit: 500 });
    console.log(
      `  supprimés. Racine restante : ${(remaining ?? []).map((f) => f.name).join(", ") || "(vide)"}`
    );
  }
}

console.log("\n== APRÈS ==");
let total = 0;
for (const t of [...TABLES_TO_CLEAR, ...TABLES_KEPT]) {
  const n = await countTable(t);
  if (TABLES_TO_CLEAR.includes(t)) total += Number.isNaN(n) ? 0 : n;
  console.log(`  ${t.padEnd(28)} ${n}`.replace("NaN", " ERREUR "));
}
console.log(`\nTotal restant dans les tables nettoyées : ${total}`);
if (total !== 0) {
  console.log("⚠️  Des lignes restent dans les tables devant être vides.");
  process.exitCode = 1;
} else {
  console.log("✓ Remise à zéro effectuée. Comptes et configuration conservés.");
}