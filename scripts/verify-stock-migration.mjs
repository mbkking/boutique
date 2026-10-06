/**
 * VÉRIFICATION POST-MIGRATION 026.
 *
 * Invariant : pour tout produit,
 *   products.stock_on_hand = SUM(product_variants.stock_on_hand WHERE is_active)
 *
 * Sort avec le code 1 si l'invariant est rompu, pour servir de garde dans
 * une chaîne de déploiement. LECTURE SEULE : ne modifie aucune donnée.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const pad = (value, width) => String(value ?? "").padEnd(width);
const num = (value) => String(value ?? 0).padStart(5);

const { data: products, error: productsError } = await supabase
  .from("products")
  .select("id, name, sku, stock_on_hand, stock_reserved, is_active");
if (productsError) {
  console.error("ERREUR lecture products :", productsError.message);
  process.exit(1);
}

const { data: variants, error: variantsError } = await supabase
  .from("product_variants")
  .select("id, product_id, sku, stock_on_hand, stock_reserved, is_active");
if (variantsError) {
  console.error("ERREUR lecture product_variants :", variantsError.message);
  process.exit(1);
}

const variantsByProduct = new Map();
for (const variant of variants) {
  if (!variantsByProduct.has(variant.product_id)) variantsByProduct.set(variant.product_id, []);
  variantsByProduct.get(variant.product_id).push(variant);
}

console.log("=".repeat(96));
console.log("VÉRIFICATION POST-MIGRATION 026 — agrégat parent == somme variantes actives");
console.log("=".repeat(96));
console.log(
  `${pad("PRODUIT", 32)}${pad("SKU", 22)}${num("PARENT")}${num("ATTENDU")}${num("DIFF")}${num("RÉS")}  ${pad("ACTIF", 6)}STATUT`
);
console.log("-".repeat(96));

const failures = [];

for (const product of products) {
  const list = variantsByProduct.get(product.id) ?? [];
  const active = list.filter((variant) => variant.is_active);
  const expected = active.reduce((sum, variant) => sum + variant.stock_on_hand, 0);
  const diff = product.stock_on_hand - expected;

  let status;
  if (list.length === 0) {
    status = "FAIL — AUCUNE VARIANTE (invendable)";
    failures.push({ product, reason: "aucune variante", expected, actual: product.stock_on_hand });
  } else if (diff !== 0) {
    status = `FAIL — écart de ${diff}`;
    failures.push({ product, reason: "agrégat désynchronisé", expected, actual: product.stock_on_hand });
  } else if (product.stock_reserved !== 0) {
    status = `FAIL — stock_reserved = ${product.stock_reserved} (doit rester 0)`;
    failures.push({ product, reason: "réservation sur le parent", expected: 0, actual: product.stock_reserved });
  } else {
    status = "OK";
  }

  console.log(
    `${pad(product.name.slice(0, 31), 32)}${pad(product.sku.slice(0, 21), 22)}${num(product.stock_on_hand)}${num(expected)}${num(diff)}${num(product.stock_reserved)}  ${pad(product.is_active, 6)}${status}`
  );
}

console.log("-".repeat(96));

const reservedSum = variants.reduce((sum, variant) => sum + variant.stock_reserved, 0);
const reservedOverOnHand = variants.filter(
  (variant) => variant.stock_reserved > variant.stock_on_hand
);

console.log();
console.log(`Produits vérifiés .................. ${products.length}`);
console.log(`Variantes .......................... ${variants.length}`);
console.log(`Produits SANS variante ............. ${products.filter((p) => (variantsByProduct.get(p.id) ?? []).length === 0).length}`);
console.log(`Total stock_reserved sur variantes . ${reservedSum}`);
console.log(`Variantes reserved > on_hand ....... ${reservedOverOnHand.length}`);
for (const variant of reservedOverOnHand) {
  console.log(`   ${variant.sku} : on_hand=${variant.stock_on_hand} reserved=${variant.stock_reserved}`);
}

if (reservedOverOnHand.length > 0) {
  console.log();
  console.log(
    "AVERTISSEMENT : une reservation depasse le stock physique. Ce n'est pas un"
  );
  console.log(
    "echec de la migration 026, mais une reservation a excede l'existant et rend"
  );
  console.log("la variante invendable. A traiter sur les commandes concernees.");
}

if (failures.length > 0) {
  console.log();
  console.log("=".repeat(96));
  console.log(`ECHEC : ${failures.length} produit(s) hors invariant`);
  console.log("=".repeat(96));
  for (const failure of failures) {
    console.log(`  ${failure.product.name} : ${failure.reason} (attendu ${failure.expected}, reel ${failure.actual})`);
  }
  process.exit(1);
}
console.log();
console.log(`SUCCES : invariant respecte sur les ${products.length} produits.`);
process.exit(0);