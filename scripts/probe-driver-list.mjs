/**
 * Contenu réellement rendu de la liste des missions du livreur.
 *
 * Isole deux questions qui étaient confondues :
 *   - la mission est-elle affichée après un rechargement complet ?
 *   - la mission apparaît-elle sans rechargement, grâce à Realtime ?
 *
 * Usage : node scripts/probe-driver-list.mjs
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
const byEmail = (mail) => users.users.find((user) => user.email === mail);
const driverId = byEmail("livreur.test@exemple.ne").id;
const { data: customer } = await service
  .from("customers")
  .select("id")
  .eq("profile_id", byEmail("client.test@exemple.ne").id)
  .single();

const orderNumber = `CMD-LIST-${Date.now().toString(36).toUpperCase()}`;
const { data: order } = await service
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
      full_name: "Client liste",
      phone: "+22790000000",
    },
  })
  .select("id")
  .single();

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const realtimeLines = [];
page.on("console", (message) => {
  if (message.text().includes("[realtime]")) realtimeLines.push(message.text().trim());
});

await page.goto("http://localhost:3003/connexion");
await page.getByLabel("Adresse e-mail").fill("livreur.test@exemple.ne");
await page.getByRole("textbox", { name: "Mot de passe" }).fill("Livreur2026!");
await page.getByRole("button", { name: "Se connecter" }).click();
await page.waitForURL((url) => !url.pathname.includes("connexion"), { timeout: 30000 });

await page.goto("http://localhost:3003/livreur/livraisons", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

const textBefore = (await page.locator("body").innerText()).replace(/\s+/g, " ");
console.log(`avant affectation — commande visible : ${textBefore.includes(orderNumber)}`);
console.log(`avant affectation — texte : ${textBefore.slice(0, 220)}`);

const { data: delivery } = await service
  .from("deliveries")
  .insert({
    order_id: order.id,
    driver_id: driverId,
    status: "ASSIGNED",
    assigned_at: new Date().toISOString(),
  })
  .select("id")
  .single();

await page.waitForTimeout(8000);
const textAfter = (await page.locator("body").innerText()).replace(/\s+/g, " ");
console.log(`après affectation (sans F5) — commande visible : ${textAfter.includes(orderNumber)}`);
console.log(`événements realtime : ${realtimeLines.join(" | ") || "(aucun)"}`);
console.log(`texte après : ${textAfter.slice(0, 300)}`);

// Contrôle : la mission est-elle visible avec un rechargement complet ?
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
const textReloaded = (await page.locator("body").innerText()).replace(/\s+/g, " ");
console.log(`après rechargement complet — commande visible : ${textReloaded.includes(orderNumber)}`);
console.log(`texte rechargé : ${textReloaded.slice(0, 300)}`);

await service.from("deliveries").delete().eq("id", delivery.id);
await service.from("orders").delete().eq("id", order.id);

await context.close();
await browser.close();

process.exit(0);