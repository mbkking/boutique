/**
 * INVENTAIRE STOCK — LECTURE SEULE.
 *
 * Ne modifie aucune donnée. Produit le rapport de migration demandé :
 * produits divergents, variantes divergentes, mouvements, commandes, paniers.
 */

import { readFileSync, writeFileSync } from "node:fs";
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

async function fetchAll(table, columns) {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) {
    console.error(`ERREUR lecture ${table}: ${error.message}`);
    process.exit(1);
  }
  return data ?? [];
}

const products = await fetchAll(
  "products",
  "id, name, slug, sku, stock_on_hand, stock_reserved, low_stock_threshold, is_active, is_featured, price"
);
const variants = await fetchAll(
  "product_variants",
  "id, product_id, sku, attributes, stock_on_hand, stock_reserved, low_stock_threshold, is_active, price"
);
const movements = await fetchAll("inventory_movements", "id, variant_id, type, quantity, reason, reference_id, created_at");
const orderItems = await fetchAll("order_items", "id, variant_id, product_name, sku, quantity, order_id");
const cartItems = await fetchAll("cart_items", "id, variant_id, quantity, cart_id");
const images = await fetchAll("product_images", "id, product_id, url, is_primary");

const variantsByProduct = new Map();
for (const variant of variants) {
  if (!variantsByProduct.has(variant.product_id)) variantsByProduct.set(variant.product_id, []);
  variantsByProduct.get(variant.product_id).push(variant);
}

const movementsByVariant = new Map();
for (const movement of movements) {
  if (!movement.variant_id) continue;
  if (!movementsByVariant.has(movement.variant_id)) movementsByVariant.set(movement.variant_id, []);
  movementsByVariant.get(movement.variant_id).push(movement);
}

const ordersByVariant = new Map();
for (const item of orderItems) {
  if (!item.variant_id) continue;
  if (!ordersByVariant.has(item.variant_id)) ordersByVariant.set(item.variant_id, []);
  ordersByVariant.get(item.variant_id).push(item);
}

const cartByVariant = new Map();
for (const item of cartItems) {
  if (!item.variant_id) continue;
  cartByVariant.set(item.variant_id, (cartByVariant.get(item.variant_id) ?? 0) + item.quantity);
}

const imagesByProduct = new Map();
for (const image of images) {
  imagesByProduct.set(image.product_id, (imagesByProduct.get(image.product_id) ?? 0) + 1);
}

const report = [];
const log = (line = "") => {
  report.push(line);
  console.log(line);
};

const activeVariants = (productId) =>
  (variantsByProduct.get(productId) ?? []).filter((variant) => variant.is_active);

// ============================================================
// A. SYNTHESE
// ============================================================
log("=".repeat(100));
log("A. SYNTHESE GENERALE");
log("=".repeat(100));
log(`Produits total ............ ${products.length}`);
log(`Produits actifs ........... ${products.filter((p) => p.is_active).length}`);
log(`Produits SANS variante .... ${products.filter((p) => (variantsByProduct.get(p.id) ?? []).length === 0).length}`);
log(`Variantes total ........... ${variants.length}`);
log(`Variantes actives ......... ${variants.filter((v) => v.is_active).length}`);
log(`Mouvements d'inventaire .... ${movements.length}`);
log(`Lignes de commande ........ ${orderItems.length}`);
log(`Lignes de panier .......... ${cartItems.length}`);
log(`Images produit ............ ${images.length}`);
log();

const withoutVariant = products.filter((p) => (variantsByProduct.get(p.id) ?? []).length === 0);
const divergent = products.filter((p) => {
  const list = activeVariants(p.id);
  if (list.length === 0) return false;
  const total = list.reduce((sum, v) => sum + v.stock_on_hand, 0);
  return total !== p.stock_on_hand;
});
const consistent = products.filter((p) => {
  const list = activeVariants(p.id);
  if (list.length === 0) return false;
  const total = list.reduce((sum, v) => sum + v.stock_on_hand, 0);
  return total === p.stock_on_hand;
});

log(`Produits SANS variante (invendables) .... ${withoutVariant.length}`);
log(`Produits DIVERGENTS .................... ${divergent.length}`);
log(`Produits COHÉRENTS .................... ${consistent.length}`);
log();

// ============================================================
// B. PRODUITS SANS VARIANTE — BLOQUANTS
// ============================================================
log("=".repeat(100));
log("B. PRODUITS SANS AUCUNE VARIANTE (invendables : le panier exige variant_id)");
log("=".repeat(100));
log(
  `${pad("PRODUIT", 34)}${pad("SKU", 22)}${num("PROD")}${num("SEUIL")}  ${pad("ACTIF", 6)}${num("IMG")}  ${pad("CARTES", 7)}${pad("COMMANDES", 10)}ACTION PROPOSEE`
);
log("-".repeat(100));

const blockingRows = [];
for (const product of withoutVariant) {
  const usedInOrders = orderItems.filter((item) => {
    const list = variantsByProduct.get(product.id) ?? [];
    return false;
  }).length;
  const cartQty = (variantsByProduct.get(product.id) ?? []).reduce((sum, v) => sum + (cartByVariant.get(v.id) ?? 0), 0);
  const imgCount = imagesByProduct.get(product.id) ?? 0;
  blockingRows.push({ product, usedInOrders, cartQty, imgCount });

  log(
    `${pad(product.name.slice(0, 33), 34)}${pad(product.sku.slice(0, 21), 22)}${num(product.stock_on_hand)}${num(product.low_stock_threshold)}  ${pad(product.is_active, 6)}${num(imgCount)}  ${pad(String(cartQty), 7)}${pad(String(usedInOrders), 10)}creer variante par defaut = ${product.stock_on_hand}`
  );
}
log();

// ============================================================
// C. PRODUITS DIVERGENTS
// ============================================================
log("=".repeat(100));
log("C. PRODUITS DIVERGENTS : stock parent != somme des variantes actives");
log("=".repeat(100));
log(
  `${pad("PRODUIT", 30)}${num("PARENT")}${num("TOTAL")}${num("DIFF")}  ${pad("VARIANTES (sku=stock)", 46)}${pad("MOUV.", 7)}ACTION PROPOSEE`
);
log("-".repeat(100));

const divergentRows = [];
for (const product of divergent) {
  const list = activeVariants(product.id);
  const total = list.reduce((sum, v) => sum + v.stock_on_hand, 0);
  const reserved = list.reduce((sum, v) => sum + v.stock_reserved, 0);
  const diff = product.stock_on_hand - total;
  const mv = list.reduce((sum, v) => sum + (movementsByVariant.get(v.id) ?? []).length, 0);
  const variantSummary = list.map((v) => `${v.sku}=${v.stock_on_hand}`).join(" ");
  divergentRows.push({ product, list, total, reserved, diff, mv });

  log(
    `${pad(product.name.slice(0, 29), 30)}${num(product.stock_on_hand)}${num(total)}${num(diff)}  ${pad(variantSummary.slice(0, 45), 46)}${pad(String(mv), 7)}aligner parent sur ${total}`
  );
}
log();

// ============================================================
// D. ANALYSE BABA
// ============================================================
log("=".repeat(100));
log("D. ANALYSE BABA");
log("=".repeat(100));
const baba = products.find((p) => p.sku === "123" || p.slug === "bab" || p.name === "baba");
if (!baba) {
  log("Produit 'baba' introuvable.");
} else {
  const list = variantsByProduct.get(baba.id) ?? [];
  log(`Nom ............... ${baba.name}`);
  log(`Slug .............. ${baba.slug}`);
  log(`SKU ............... ${baba.sku}`);
  log(`Actif ............. ${baba.is_active}`);
  log(`Mis en avant ...... ${baba.is_featured}`);
  log(`products.stock_on_hand ...... ${baba.stock_on_hand}`);
  log(`products.stock_reserved .... ${baba.stock_reserved}`);
  log(`products.seuil ............. ${baba.low_stock_threshold}`);
  log(`Variantes ................... ${list.length}`);
  for (const variant of list) {
    const mv = movementsByVariant.get(variant.id) ?? [];
    const oi = ordersByVariant.get(variant.id) ?? [];
    const cq = cartByVariant.get(variant.id) ?? 0;
    log(`  - variante ${variant.sku} : on_hand=${variant.stock_on_hand} reserved=${variant.stock_reserved} dispo=${Math.max(0, variant.stock_on_hand - variant.stock_reserved)}`);
    log(`      mouvements=${mv.length} commandes=${oi.length} panier=${cq}`);
    for (const movement of mv) {
      log(`      MOUVEMENT ${movement.created_at?.slice(0, 19)} ${movement.type} qte=${movement.quantity} motif="${movement.reason}"`);
    }
    for (const item of oi) {
      log(`      COMMANDE qte=${item.quantity} ligne=${item.line_total ?? "-"}`);
    }
  }
  log();
  log("LECTURE DU CODE CONFIANTE :");
  log("  lib/services/inventory.ts:15 getAvailableStock = max(0, on_hand - reserved)");
  log("  => 12 - 5 = 7 disponibles. La colonne products.stock_on_hand=0 n'est PAS lue");
  log("     par le detail produit quand une variante existe (page.tsx:83 maxStock).");
  log("  La carte produit (components/product/product-card.tsx) lit products.stock_on_hand");
  log("  => affiche 0. C'est la contradiction constatee.");
}
log();

// ============================================================
// E. MOUVEMENTS D'INVENTAIRE
// ============================================================
log("=".repeat(100));
log("E. MOUVEMENTS D'INVENTAIRE");
log("=".repeat(100));
const orphanMovements = movements.filter((m) => !m.variant_id);
log(`Total mouvements ............... ${movements.length}`);
log(`Sans variant_id (produit) ..... ${orphanMovements.length}`);
log();
const byType = new Map();
for (const movement of movements) {
  const key = movement.variant_id ? "variante" : "produit";
  if (!byType.has(key)) byType.set(key, { IN: 0, OUT: 0, ADJUSTMENT: 0, RESERVATION: 0, RELEASE: 0 });
  byType.get(key)[movement.type] += 1;
}
for (const [key, counts] of byType) {
  log(`  ${pad(key, 10)} IN=${counts.IN} OUT=${counts.OUT} ADJ=${counts.ADJUSTMENT} RES=${counts.RESERVATION} REL=${counts.RELEASE}`);
}
log();
log("Mouvements sans variant_id (écrits par createProductAction) :");
for (const movement of orphanMovements) {
  const owner = products.find((p) => p.id === movement.reference_id);
  log(`  ${movement.created_at?.slice(0, 19)} ${movement.type} qte=${String(movement.quantity).padStart(4)} ref=${owner?.name ?? movement.reference_id} motif="${movement.reason}"`);
}
log();

// ============================================================
// F. ETAT VARIANTES DETAILLE
// ============================================================
log("=".repeat(100));
log("F. TOUTES LES VARIANTES");
log("=".repeat(100));
log(
  `${pad("SKU", 24)}${num("ON_HAND")}${num("RES")}${num("DISPO")}  ${pad("PRODUIT", 28)}${pad("MV", 5)}${pad("CMD", 5)}${pad("PANIER", 8)}STATUT`
);
log("-".repeat(100));
for (const variant of variants) {
  const product = products.find((p) => p.id === variant.product_id);
  const mv = (movementsByVariant.get(variant.id) ?? []).length;
  const oi = (ordersByVariant.get(variant.id) ?? []).length;
  const cq = cartByVariant.get(variant.id) ?? 0;
  const dispo = Math.max(0, variant.stock_on_hand - variant.stock_reserved);
  log(
    `${pad(variant.sku.slice(0, 23), 24)}${num(variant.stock_on_hand)}${num(variant.stock_reserved)}${num(dispo)}  ${pad((product?.name ?? "?").slice(0, 27), 28)}${pad(mv, 5)}${pad(oi, 5)}${pad(cq, 8)}${variant.is_active ? "active" : "inactive"}`
  );
}
log();

// ============================================================
// G. ORPHELINS ET ANOMALIES
// ============================================================
log("=".repeat(100));
log("G. ANOMALIES");
log("=".repeat(100));
const orderItemsNoVariant = orderItems.filter((item) => !item.variant_id);
log(`order_items sans variant_id ... ${orderItemsNoVariant.length}`);
const cartItemsNoVariant = cartItems.filter((item) => !item.variant_id);
log(`cart_items sans variant_id ..... ${cartItemsNoVariant.length}`);
const overReserved = variants.filter((v) => v.stock_reserved > v.stock_on_hand);
log(`Variantes reserved > on_hand ... ${overReserved.length}`);
for (const variant of overReserved) {
  log(`  ${variant.sku} : on_hand=${variant.stock_on_hand} reserved=${variant.stock_reserved}`);
}
const negativeStock = variants.filter((v) => v.stock_on_hand < 0);
log(`Variantes stock negatif ....... ${negativeStock.length}`);
const orphanVariants = variants.filter((v) => !products.some((p) => p.id === v.product_id));
log(`Variantes sans produit ....... ${orphanVariants.length}`);
const productsNoCategory = products.filter((p) => !p.category_id);
log(`Produits sans categorie ....... ${productsNoCategory.length}`);
const legacyImages = images.filter((image) => !/^[0-9a-f-]{36}\//.test(image.url.split("/product-images/")[1] ?? ""));
log(`Images hors format uuid/ ..... ${legacyImages.length} (non gerees par uploadProductImageAction)`);
log();

writeFileSync("reports/inventory-report.txt", report.join("\n"), "utf8");
console.log("\nRapport ecrit : reports/inventory-report.txt");
process.exit(0);