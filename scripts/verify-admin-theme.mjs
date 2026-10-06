/**
 * Vérification bout en bout du thème admin : création d'un administrateur
 * temporaire, connexion réelle, contrôle des variables CSS appliquées, puis
 * suppression du compte.
 *
 * Usage : node scripts/verify-admin-theme.mjs
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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const email = `theme-check-${Date.now()}@example.test`;
const password = `Theme-${Date.now()}-Aa1!`;
const BASE = process.env.VERIFY_BASE_URL ?? "http://admin.localhost:3000";

const created = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Verification Theme", phone: "+22790001234" },
});

if (created.error) {
  console.error("Création du compte impossible :", created.error.message);
  process.exit(1);
}

const userId = created.data.user.id;

await supabase
  .from("profiles")
  .update({ role: "admin", is_active: true })
  .eq("id", userId);

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.goto(`${BASE}/connexion`);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("textbox", { name: "Mot de passe" }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.includes("connexion"), { timeout: 30000 });

  await page.goto(`${BASE}/admin`);
  await page.waitForSelector(".admin-theme", { timeout: 30000 });

  const read = async (property) =>
    page
      .locator(".admin-theme")
      .evaluate(
        (element, name) => getComputedStyle(element).getPropertyValue(name).trim(),
        property
      );

  console.log("--admin-card-radius      :", await read("--admin-card-radius"));
  console.log("--admin-primary          :", await read("--admin-primary"));
  console.log("--admin-badge-background :", await read("--admin-badge-background"));
  console.log("--admin-border-style     :", await read("--admin-border-style"));
  console.log("--color-surface (carte)  :", await read("--color-surface"));

  const cardBackground = await page
    .locator(".admin-theme [data-admin-surface]")
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  const cardBorderStyle = await page
    .locator(".admin-theme [data-admin-surface]")
    .first()
    .evaluate((element) => getComputedStyle(element).borderTopStyle);
  const pageBackground = await page
    .locator(".admin-theme")
    .evaluate((element) => getComputedStyle(element).backgroundColor);

  console.log("fond de carte calculé  :", cardBackground);
  console.log("bordure de carte       :", cardBorderStyle);
  console.log("fond de page           :", pageBackground);
} finally {
  await browser.close();
  await supabase.auth.admin.deleteUser(userId);
  console.log("Compte de vérification supprimé.");
}