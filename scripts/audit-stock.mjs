/**
 * Audit du stock en base.
 *
 * Lit les produits et compare ce que l'administration écrit
 * (`products.stock_on_hand`) avec ce que le client lit, sans jamais
 * afficher de clé.
 *
 * Usage : node scripts/audit-stock.mjs
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const content = readFileSync(".env.local", "utf8");
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.log("Clés absentes : fin de l'audit.");
  process.exit(0);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

console.log("=== PRODUITS : stock_on_hand / stock_reserved ===");
const { data: products, error } = await supabase
  .from("products")
  .select("id, name, sku, stock_on_hand, stock_reserved, low_stock_threshold, is_active")
  .order("created_at", { ascending: false })
  .limit(30);

if (error) {
  console.log(`erreur : ${error.message}`);
  process.exit(0);
}

const anomalies = [];

for (const product of products ?? []) {
  const onHand = product.stock_on_hand;
  const reserved = product.stock_reserved;

  const onHandType = onHand === null ? "NULL" : typeof onHand;
  const reservedType = reserved === null ? "NULL" : typeof reserved;

  console.log(
    `${String(product.name).slice(0, 28).padEnd(28)} on_hand=${String(onHand).padStart(4)} (${onHandType}) réservé=${String(reserved).padStart(4)} (${reservedType}) seuil=${product.low_stock_threshold}`
  );

  if (onHand === null) anomalies.push(`${product.name} : stock_on_hand est NULL`);
  if (reserved === null) anomalies.push(`${product.name} : stock_reserved est NULL`);
  if (reserved !== null && onHand !== null && Number(reserved) > Number(onHand)) {
    anomalies.push(`${product.name} : réservé (${reserved}) > on_hand (${onHand})`);
  }
}

console.log("\n=== VARIANTES ===");
const { data: variants } = await supabase
  .from("product_variants")
  .select("id, product_id, sku, stock_on_hand, stock_reserved, is_active")
  .limit(30);

console.log(`${variants?.length ?? 0} variante(s)`);
for (const variant of variants ?? []) {
  console.log(
    `  ${String(variant.sku).slice(0, 30).padEnd(30)} on_hand=${variant.stock_on_hand} réservé=${variant.stock_reserved} actif=${variant.is_active}`
  );
}

console.log("\n=== MOUVEMENTS D'INVENTAIRE (10 derniers) ===");
const { data: movements } = await supabase
  .from("inventory_movements")
  .select("id, variant_id, type, quantity, reason, created_at")
  .order("created_at", { ascending: false })
  .limit(10);

for (const movement of movements ?? []) {
  console.log(
    `  ${movement.type.padEnd(11)} qté=${String(movement.quantity).padStart(4)} variant=${movement.variant_id ?? "null"} — ${movement.reason}`
  );
}

console.log("\n=== ANOMALIES ===");
console.log(anomalies.length === 0 ? "aucune" : anomalies.join("\n"));

process.exit(0);