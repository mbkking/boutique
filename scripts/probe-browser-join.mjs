/**
 * Trame d'abonnement Realtime réellement envoyée par le navigateur.
 *
 * Le canal répond `SUBSCRIBED` mais aucun événement n'arrive. Or un client
 * `authenticated` reçoit bien l'événement côté Node : la différence est donc
 * dans la trame d'abonnement. Ce script affiche la trame `phx_join` (donc le
 * jeton transmis) et tout ce qui arrive après une insertion.
 *
 * Usage : node scripts/probe-browser-join.mjs
 */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\n/)
    .filter((line) => line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    })
);

const base = "http://localhost:3002";
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

let joined = false;

page.on("console", (message) => {
  if (message.text().includes("[realtime]")) console.log(`  [console] ${message.text()}`);
});

page.on("websocket", (socket) => {
  if (!socket.url().includes("/realtime/")) return;

  const shorten = (frame) => String(frame.payload ?? "");

  socket.on("framesent", (frame) => {
    const payload = shorten(frame);
    if (!payload.includes("phx_join")) return;
    joined = true;
    // Le jeton est-il transmis ? On ne l'affiche pas en clair.
    const hasToken = /access_token\\*"?\s*:\\*"?[^n]/.test(payload) && !payload.includes('access_token\\*"?\s*:\\*"?\\*?"?\\s*:\\*"?null');
    console.log("  [join envoyé]");
    console.log(`    length=${payload.length}`);
    console.log(`    contient "access_token" : ${payload.includes("access_token")}`);
    console.log(`    contient "null" comme jeton : ${payload.includes(":null")}`);
    console.log(`    extrait : ${payload.slice(0, 300)}`);
    void hasToken;
  });

  socket.on("framereceived", (frame) => {
    const payload = shorten(frame);
    if (!joined) return;
    if (payload.includes("postgres_changes") || payload.includes("phx_reply")) {
      console.log(`  [reçu après abonnement] ${payload.slice(0, 200)}`);
    }
  });
});

await page.goto(`${base}/connexion`);
await page.getByLabel("Adresse e-mail").fill("admin.test@exemple.ne");
await page.getByRole("textbox", { name: "Mot de passe" }).fill("Admin2026!");
await page.getByRole("button", { name: "Se connecter" }).click();
await page.waitForURL((url) => !url.pathname.includes("connexion"), { timeout: 30000 });

await page.goto(`${base}/admin/orders`);
// L'abonnement doit être confirmé avant d'écrire (PHASE 10).
await page.waitForTimeout(9000);

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const orderNumber = `CMD-JOIN-${Date.now().toString(36).toUpperCase()}`;
const { error } = await service.from("orders").insert({
  order_number: orderNumber,
  status: "PENDING_CONFIRMATION",
  payment_method: "COD",
  payment_status: "COD_PENDING",
  subtotal: 1000,
  delivery_fee: 0,
  discount: 0,
  total: 1000,
  address_snapshot: { full_name: "Probe join", phone: "+22790000000" },
});

console.log(`insertion ${orderNumber} : ${error ? error.message : "ok"}`);

await page.waitForTimeout(10000);

const { data: row } = await service
  .from("orders")
  .select("id")
  .eq("order_number", orderNumber)
  .single();

if (row) await service.from("orders").delete().eq("id", row.id);

await context.close();
await browser.close();

process.exit(0);