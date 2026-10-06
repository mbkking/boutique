/**
 * Vérification de l'écran « Paramètres → Apparence » : chargement des
 * réglages, sauvegarde, application du thème sur l'admin, puis restauration.
 *
 * Usage : node scripts/verify-appearance-screen.mjs
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
const email = `appearance-check-${Date.now()}@example.test`;
const password = `Appearance-${Date.now()}-Aa1!`;
const BASE = process.env.VERIFY_BASE_URL ?? "http://admin.localhost:3000";

const created = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Verification Apparence", phone: "+22790009999" },
});

if (created.error) {
  console.error("Création du compte impossible :", created.error.message);
  process.exit(1);
}

const userId = created.data.user.id;
await supabase.from("profiles").update({ role: "admin", is_active: true }).eq("id", userId);

const browser = await chromium.launch();
const page = await browser.newPage();
const check = (label, actual, expected) => {
  const ok = expected === undefined ? actual !== null : actual === expected;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: ${actual}${expected ? ` (attendu ${expected})` : ""}`);
  if (!ok) process.exitCode = 1;
};

try {
  await page.goto(`${BASE}/connexion`);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("textbox", { name: "Mot de passe" }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.includes("connexion"), { timeout: 30000 });

  await page.goto(`${BASE}/admin/settings`);
  await page.waitForSelector("h2#titre-apparence", { timeout: 30000 });

  check("écran Apparence présent", await page.locator("h2#titre-apparence").isVisible(), true);
  check("aperçu présent", await page.getByText("Carte d'aperçu").isVisible(), true);

  // 1. Fond global
  await page.getByLabel("Couleur de fond").first().fill("#101820");
  // 2. Fond des cartes
  await page.getByLabel("Fond des cartes").first().fill("#fff7ed");
  // 3. Bordures
  await page.getByLabel("Couleur des bordures").first().fill("#dde4e7");
  // 4. Rayon des cartes
  await page.getByLabel(/Rayon des cartes/).selectOption("24");
  // 5. Bouton
  await page.getByLabel("Couleur des boutons").first().fill("#7c2d12");

  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await page.waitForSelector("text=Apparence enregistrée.", { timeout: 30000 });
  check("message de succès", true, true);

  await page.goto(`${BASE}/admin/products`);
  await page.waitForSelector(".admin-theme");

  const vars = await page.locator(".admin-theme").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      radius: style.getPropertyValue("--admin-card-radius").trim(),
      background: style.backgroundColor,
    };
  });
  check("rayon appliqué", vars.radius, "24px");

  const cardBackground = await page
    .locator(".admin-theme [data-admin-surface]")
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  check("fond de carte appliqué", cardBackground, "rgb(255, 247, 237)");

  const buttonBackground = await page
    .locator(".admin-theme [data-admin-button]")
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  check("couleur de bouton appliquée", buttonBackground, "rgb(124, 45, 18)");

  // Restauration
  await page.goto(`${BASE}/admin/settings`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restaurer par défaut" }).click();
  await page.waitForSelector("text=Apparence enregistrée.", { timeout: 30000 });
  check("restauration", true, true);
} finally {
  await browser.close();
  await supabase.auth.admin.deleteUser(userId);
  console.log("Compte de vérification supprimé.");
}