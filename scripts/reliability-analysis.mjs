/**
 * ANALYSE DE FIABILITE — LECTURE SEULE.
 *
 * Pour chaque variante, reconstruit le stock attendu a partir des mouvements
 * d'inventaire et le compare a la valeur reellement stockee, afin de
 * determiner quelle source (variante ou produit parent) est la plus fiable.
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

async function fetchAll(table, columns) {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) {
    console.error(`ERREUR ${table}: ${error.message}`);
    process.exit(1);
  }
  return data ?? [];
}

const products = await fetchAll(
  "products",
  "id, name, slug, sku, category_id, stock_on_hand, stock_reserved, low_stock_threshold, is_active, price, compare_at_price"
);
const variants = await fetchAll(
  "product_variants",
  "id, product_id, sku, stock_on_hand, stock_reserved, low_stock_threshold, is_active, price, compare_at_price, created_at"
);
const movements = await fetchAll(
  "inventory_movements",
  "id, variant_id, type, quantity, reason, reference_id, created_at"
);
const orderItems = await fetchAll("order_items", "id, variant_id, product_name, sku, quantity, order_id");
const orders = await fetchAll("orders", "id, order_number, status, created_at");

const orderById = new Map(orders.map((order) => [order.id, order]));
const productById = new Map(products.map((product) => [product.id, product]));

const pad = (value, width) => String(value ?? "").padEnd(width);
const num = (value) => String(value ?? 0).padStart(5);
const report = [];
const log = (line = "") => {
  report.push(line);
  console.log(line);
};

const movementsByVariant = new Map();
for (const movement of movements) {
  if (!movement.variant_id) continue;
  if (!movementsByVariant.has(movement.variant_id)) movementsByVariant.set(movement.variant_id, []);
  movementsByVariant.get(movement.variant_id).push(movement);
}

const orderLinesByVariant = new Map();
for (const item of orderItems) {
  if (!item.variant_id) continue;
  if (!orderLinesByVariant.has(item.variant_id)) orderLinesByVariant.set(item.variant_id, []);
  orderLinesByVariant.get(item.variant_id).push(item);
}

// ============================================================
// 1. RECONSTRUCTION DEPUIS LES MOUVEMENTS
// ============================================================
log("=".repeat(104));
log("1. RECONSTRUCTION DU STOCK DEPUIS LES MOUVEMENTS (variante par variante)");
log("=".repeat(104));
log(
  `${pad("SKU", 22)}${num("STOCK")}${num("RECONSTR")}${num("ECART")}${num("IN")}${num("OUT")}${num("RES")}${num("REL")}  ${pad("FIABILITE", 30)}MOTIF`
);
log("-".repeat(104));

const rows = [];
for (const variant of variants) {
  const list = (movementsByVariant.get(variant.id) ?? []).slice().sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at))
  );
  const sums = { IN: 0, OUT: 0, ADJUSTMENT: 0, RESERVATION: 0, RELEASE: 0 };
  for (const movement of list) sums[movement.type] += movement.quantity;

  // Reconstruit le stock physique : IN et OUT touchent on_hand.
  // ADJUSTMENT est un ecart signe ; RESERVATION/RELEASE touchent reserved.
  const reconstructedOnHand = sums.IN - sums.OUT + sums.ADJUSTMENT;
  const reconstructedReserved = sums.RESERVATION - sums.RELEASE;
  const gap = variant.stock_on_hand - reconstructedOnHand;

  let verdict;
  let motive;
  if (list.length === 0) {
    verdict = "FIABLE (valeur initiale)";
    motive = "aucun mouvement : valeur de creation fiable";
  } else if (gap === 0 && reconstructedReserved === variant.stock_reserved) {
    verdict = "FIABLE (coherent)";
    motive = "stock et reservation reconstructs a l'identique";
  } else if (gap === 0 && reconstructedReserved !== variant.stock_reserved) {
    verdict = "STOCK FIABLE / RESERVATION INCOHERENTE";
    motive = `reserved reel ${variant.stock_reserved} vs mouvements ${reconstructedReserved}`;
  } else {
    verdict = "STOCK INCOHERENT AVEC MOUVEMENTS";
    motive = `ecart non explique par l'historique`;
  }

  rows.push({ variant, list, sums, reconstructedOnHand, reconstructedReserved, gap, verdict, motive });

  log(
    `${pad(variant.sku.slice(0, 21), 22)}${num(variant.stock_on_hand)}${num(reconstructedOnHand)}${num(gap)}${num(sums.IN)}${num(sums.OUT)}${num(sums.RESERVATION)}${num(sums.RELEASE)}  ${pad(verdict.slice(0, 29), 30)}${motive}`
  );
}
log();

const incoherent = rows.filter((row) => row.gap !== 0);
log(`Variantes dont le stock ne correspond PAS aux mouvements : ${incoherent.length} / ${variants.length}`);
for (const row of incoherent) {
  log(`  ${row.variant.sku} : stock=${row.variant.stock_on_hand} reconstruit=${row.reconstructedOnHand}`);
  for (const movement of row.list) {
    log(`     ${movement.created_at?.slice(0, 19)} ${movement.type} ${movement.quantity}`);
  }
}
log();

// ============================================================
// 2. RESERVATIONS : 30 RESERVATION vs reserved reel
// ============================================================
log("=".repeat(104));
log("2. RESERVATIONS : L'ECART ENTRE MOUVEMENTS ET COLONNE stock_reserved");
log("=".repeat(104));
let totalResMovements = 0;
let totalReservedColumn = 0;
for (const row of rows) {
  totalResMovements += row.sums.RESERVATION - row.sums.RELEASE;
  totalReservedColumn += row.variant.stock_reserved;
}
log(`Total RESERVATION - RELEASE dans l'historique ... ${totalResMovements}`);
log(`Total stock_reserved dans les colonnes ......... ${totalReservedColumn}`);
log(`Ecart .......................................... ${totalResMovements - totalReservedColumn}`);
log();
log("Lecture : les reservations ont ete augmentees par le code mais jamais ");
log("relachees (aucun mouvement RELEASE dans la base). Les colonnes ");
log("stock_reserved ont ete remises a 0 manuellement en dehors du service ");
log("d'inventaire. L'historique ne peut donc pas servir de reference pour ");
log("stock_reserved : seule la colonne fait foi pour les reservations.");
log();

// ============================================================
// 3. COMMANDES : VRAI SIGNAL PHYSIQUE
// ============================================================
log("=".repeat(104));
log("3. COMMANDES PAR VARIANTE (le signal physique le plus fiable)");
log("=".repeat(104));
log(`${pad("SKU", 22)}${num("QTE CMD")}${num("STOCK")}  COMMANDES DETAILLEES`);
log("-".repeat(104));
for (const row of rows) {
  const lines = orderLinesByVariant.get(row.variant.id) ?? [];
  if (lines.length === 0) continue;
  const qty = lines.reduce((sum, item) => sum + item.quantity, 0);
  const detail = lines
    .map((item) => {
      const order = orderById.get(item.order_id);
      return `${order?.order_number ?? "?"}(${order?.status ?? "?"}) x${item.quantity}`;
    })
    .join(" ");
  log(`${pad(row.variant.sku.slice(0, 21), 22)}${num(qty)}${num(row.variant.stock_on_hand)}  ${detail}`);
}
log();

const cancelledStatuses = new Set(["CANCELLED", "CANCELED"]);
const realDemand = new Map();
for (const item of orderItems) {
  if (!item.variant_id) continue;
  const order = orderById.get(item.order_id);
  if (!order || cancelledStatuses.has(order.status)) continue;
  realDemand.set(item.variant_id, (realDemand.get(item.variant_id) ?? 0) + item.quantity);
}
log("Quantites commandees hors commandes annulees, par variante :");
for (const [variantId, qty] of realDemand) {
  const variant = variants.find((v) => v.id === variantId);
  log(`  ${pad(variant?.sku ?? "?", 22)} commande=${qty} stock_actuel=${variant?.stock_on_hand}`);
}
log();

// ============================================================
// 4. PRODUIT PARENT : SOURCE FIABLE OU NON
// ============================================================
log("=".repeat(104));
log("4. PRODUIT PARENT : PEUT-ON LUI FAIRE CONFIANCE ?");
log("=".repeat(104));
log(`${pad("PRODUIT", 30)}${num("PARENT")}${num("TOTAL VAR")}${num("DIFF")}  ${pad("CATEGORIE", 14)}${pad("ACTIF", 7)}VERDICT`);
log("-".repeat(104));
for (const product of products) {
  const list = (variantsByProduct(product) ?? []).filter((v) => v.is_active);
  const total = list.reduce((sum, v) => sum + v.stock_on_hand, 0);
  const diff = product.stock_on_hand - total;
  let verdict;
  if (list.length === 0) verdict = "SANS VARIANTE (invendable)";
  else if (diff === 0) verdict = "coherent";
  else verdict = "DIVERGENT";
  log(
    `${pad(product.name.slice(0, 29), 30)}${num(product.stock_on_hand)}${num(total)}${num(diff)}  ${pad(product.category_id ? "oui" : "NON", 14)}${pad(product.is_active, 7)}${verdict}`
  );
}
log();

function variantsByProduct(product) {
  return variants.filter((variant) => variant.product_id === product.id);
}

// ============================================================
// 5. PROPOSITION DE VALEUR RETENUE PAR PRODUIT
// ============================================================
log("=".repeat(104));
log("5. VALEUR RETENUE PROPOSEE (variantes = source de verite)");
log("=".repeat(104));
log(`${pad("PRODUIT", 30)}${pad("SKU PRODUIT", 22)}${pad("ACTION", 34)}JUSTIFICATION`);
log("-".repeat(104));
for (const product of products) {
  const list = variantsByProduct(product);
  const active = list.filter((v) => v.is_active);
  const total = active.reduce((sum, v) => sum + v.stock_on_hand, 0);
  const parent = product.stock_on_hand;

  if (list.length === 0) {
    log(
      `${pad(product.name.slice(0, 29), 30)}${pad(product.sku.slice(0, 21), 22)}${pad(`creer variante = ${parent}`, 34)}produit cree sans variante ; stock parent = ${parent} est la seule donnee existante`
    );
    continue;
  }

  const hasOrders = list.some((v) => (orderLinesByVariant.get(v.id) ?? []).length > 0);
  const hasGap = total !== parent;

  if (!hasGap) {
    log(`${pad(product.name.slice(0, 29), 30)}${pad(product.sku.slice(0, 21), 22)}${pad("aucune action", 34)}parent ${parent} = somme variantes ${total}`);
  } else if (hasOrders) {
    log(
      `${pad(product.name.slice(0, 29), 30)}${pad(product.sku.slice(0, 21), 22)}${pad(`aligner parent sur ${total}`, 34)}variantes avec commandes reelles : le stock physique des variantes prime`
    );
  } else {
    log(
      `${pad(product.name.slice(0, 29), 30)}${pad(product.sku.slice(0, 21), 22)}${pad(`aligner parent sur ${total}`, 34)}aucune commande : la valeur du parent n'a pas d'origine tracable, celle des variantes est coherente`
    );
  }
}
log();

writeFileSync("reports/reliability-analysis.txt", report.join("\n"), "utf8");
console.log("\nRapport ecrit : reports/reliability-analysis.txt");
process.exit(0);