/**
 * Scénario « Admin → Livreur » instrumenté.
 *
 * Vérifie deux choses distinctes, car un échec peut venir de l'une ou de
 * l'autre :
 *
 *   1. l'événement `deliveries` arrive-t-il dans le navigateur du livreur ?
 *   2. l'interface affiche-t-elle ensuite la livraison ?
 *
 * Usage : node scripts/probe-browser-driver.mjs
 */

import { readFileSync } from "node:fs";
import { chromium } from "playwright";
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

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: users } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
const driverUser = users.users.find((user) => user.email === "livreur.test@exemple.ne");

const { data: customer } = await service
  .from("customers")
  .select("id")
  .eq("profile_id", users.users.find((user) => user.email === "client.test@exemple.ne").id)
  .single();

const orderNumber = `CMD-DRV-${Date.now().toString(36).toUpperCase()}`;

const { data: order, error: orderError } = await service
  .from("orders")
  .insert({
    order_number: orderNumber,
    customer_id: customer.id,
    status: "CONFIRMED",
    payment_method: "COD",
    payment_status: "COD_PENDING",
    subtotal: 10000,
    delivery_fee: 0,
    discount: 0,
    total: 10000,
    currency: "XOF",
    address_snapshot: {
      city: "Niamey",
      quarter: "Yantala",
      landmark: null,
      instructions: null,
      full_name: "Client livreur",
      phone: "+22790000000",
    },
  })
  .select("id")
  .single();

if (orderError) throw orderError;

// Une commande sans article peut être invisible dans une liste construite par
// jointure : le test doit donc fournir un contenu réaliste.
const { error: itemError } = await service.from("order_items").insert({
  order_id: order.id,
  product_id: null,
  product_name: "Article test temps réel",
  unit_price: 10000,
  quantity: 1,
  line_total: 10000,
});

if (itemError) console.log(`article ignoré : ${itemError.message}`);

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

page.on("console", (message) => {
  if (message.text().includes("[realtime]")) console.log(`  [console] ${message.text()}`);
});

await page.goto("http://localhost:3003/connexion");
await page.getByLabel("Adresse e-mail").fill("livreur.test@exemple.ne");
await page.getByRole("textbox", { name: "Mot de passe" }).fill("Livreur2026!");
await page.getByRole("button", { name: "Se connecter" }).click();
await page.waitForURL((url) => !url.pathname.includes("connexion"), { timeout: 30000 });

await page.goto("http://localhost:3003/livreur", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);

const before = await page.content();
console.log(`avant affectation : commande visible = ${before.includes(orderNumber)}`);

const { data: delivery, error: deliveryError } = await service
  .from("deliveries")
  .insert({
    order_id: order.id,
    driver_id: driverUser.id,
    status: "ASSIGNED",
    assigned_at: new Date().toISOString(),
  })
  .select("id")
  .single();

if (deliveryError) throw deliveryError;

await page.waitForTimeout(8000);
const after = await page.content();
console.log(`après affectation : commande visible = ${after.includes(orderNumber)}`);
console.log(`page modifiée sans rechargement = ${before !== after}`);

if (!after.includes(orderNumber)) {
  const snippet = after.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 400);
  console.log(`contenu de la page : ${snippet}`);
}

await service.from("deliveries").delete().eq("id", delivery.id);
await service.from("orders").delete().eq("id", order.id);

await context.close();
await browser.close();

process.exit(0);