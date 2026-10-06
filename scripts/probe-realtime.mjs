/**
 * Diagnostic Realtime : la publication contient-elle les tables, et un
 * navigateur reçoit-il réellement un événement ?
 *
 * Usage : node scripts/probe-realtime.mjs
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
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const orderNumber = `CMD-PROBE-${Date.now().toString(36).toUpperCase()}`;

console.log("Publication Realtime + écoute dans le processus Node :");

const channel = anon.channel("probe-orders");
channel.on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
  console.log("  → événement reçu (Node)");
});

channel.subscribe((status, error) => {
  console.log("  statut de l'abonnement :", status, error ? error.message : "");
});

await new Promise((resolve) => setTimeout(resolve, 4000));

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
  console.error("  insertion impossible :", error.message);
  process.exit(1);
}

console.log("  commande insérée :", order.id);
await new Promise((resolve) => setTimeout(resolve, 5000));

await admin.from("orders").delete().eq("id", order.id);
console.log("  commande supprimée.");

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (message) => {
  const text = message.text();
  if (/realtime|CHANNEL|subscribe|SUBSCRIBED|CHANNEL_ERROR/i.test(text)) {
    console.log("  [navigateur]", text.slice(0, 300));
  }
});

await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
await browser.close();

void channel;