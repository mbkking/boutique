/**
 * Diagnostic du transport Realtime dans le navigateur.
 *
 * Affiche *tous* les messages console de la page (pas seulement nos traces) afin
 * de distinguer un problème de transport (websocket) d'un problème de
 * souscription ou de RLS.
 *
 * Usage : node scripts/probe-browser-realtime.mjs
 */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
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

const base = "http://localhost:3002";
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
let phase = "avant";

page.on("console", (message) => {
  console.log(`  [console:${message.type()}] ${message.text()}`);
});
page.on("pageerror", (error) => {
  console.log(`  [pageerror] ${error.message}`);
});
page.on("websocket", (socket) => {
  console.log(`  [websocket] ouverture ${socket.url().slice(0, 120)}`);
  socket.on("framereceived", (frame) => {
    const payload = String(frame.payload ?? "");
    if (phase === "apres") {
      console.log(`  [websocket:reçu] ${payload.slice(0, 160)}`);
    }
  });
  socket.on("close", () => console.log("  [websocket] fermée"));
});

await page.goto(`${base}/connexion`);
await page.getByLabel("Adresse e-mail").fill("admin.test@exemple.ne");
await page.getByRole("textbox", { name: "Mot de passe" }).fill("Admin2026!");
await page.getByRole("button", { name: "Se connecter" }).click();
await page.waitForURL((url) => !url.pathname.includes("connexion"), { timeout: 30000 });

await page.goto(`${base}/admin/orders`);
await page.waitForTimeout(8000);

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const orderNumber = `CMD-BRT-${Date.now().toString(36).toUpperCase()}`;
const { error } = await service.from("orders").insert({
  order_number: orderNumber,
  status: "PENDING_CONFIRMATION",
  payment_method: "COD",
  payment_status: "COD_PENDING",
  subtotal: 1000,
  delivery_fee: 0,
  discount: 0,
  total: 1000,
  address_snapshot: { full_name: "Probe", phone: "+22790000000" },
});

console.log("insertion :", error ? error.message : "ok");
phase = "apres";

await page.waitForTimeout(12000);

const { data: row } = await service
  .from("orders")
  .select("id")
  .eq("order_number", orderNumber)
  .single();

if (row) await service.from("orders").delete().eq("id", row.id);

await context.close();
await browser.close();