/**
 * Diagnostic ciblé : l'abonnement Realtime de l'écran admin s'établit-il, et
 * l'événement déclenche-t-il un rechargement ?
 *
 * Usage : node scripts/probe-admin-realtime.mjs
 */

import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
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

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", (message) => {
  const text = message.text();
  if (text.includes("[realtime]")) console.log("  [console]", text);
});

await page.goto("http://localhost:3002/connexion");
await page.getByLabel("Adresse e-mail").fill("admin.test@exemple.ne");
await page.getByRole("textbox", { name: "Mot de passe" }).fill("Admin2026!");
await page.getByRole("button", { name: "Se connecter" }).click();
await page.waitForURL((url) => !url.pathname.includes("connexion"), { timeout: 30000 });

await page.goto("http://localhost:3002/admin/orders", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);

const orderNumber = `CMD-PROBE-${Date.now().toString(36).toUpperCase()}`;

const { data: order, error } = await admin
  .from("orders")
  .insert({
    order_number: orderNumber,
    status: "PENDING_CONFIRMATION",
    payment_method: "COD",
    payment_status: "COD_PENDING",
    subtotal: 1000,
    delivery_fee: 0,
    discount: 0,
    total: 1000,
    address_snapshot: { full_name: "Probe", phone: "+22790000000" },
  })
  .select("id")
  .single();

if (error) {
  console.error("insertion impossible :", error.message);
  process.exit(1);
}

await page.waitForTimeout(8000);
const visible = (await page.content()).includes(orderNumber);
console.log(`  commande visible après événement : ${visible ? "OUI" : "NON"} (${orderNumber})`);

await admin.from("orders").delete().eq("id", order.id);
await browser.close();