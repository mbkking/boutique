/**
 * État de la session Supabase **dans le navigateur**.
 *
 * Le canal Realtime du navigateur se comporte comme `anon` (abonné, aucun
 * événement). Or un client `authenticated` reçoit bien l'événement. Ce script
 * vérifie donc ce que le navigateur voit réellement : le cookie de session et
 * sa valeur.
 *
 * Usage : node scripts/probe-browser-session.mjs [port] [email] [mot de passe]
 */

import { chromium } from "playwright";

const port = process.argv[2] ?? "3002";
const email = process.argv[3] ?? "admin.test@exemple.ne";
const password = process.argv[4] ?? "Admin2026!";

const base = `http://localhost:${port}`;

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`${base}/connexion`);
await page.getByLabel("Adresse e-mail").fill(email);
await page.getByRole("textbox", { name: "Mot de passe" }).fill(password);
await page.getByRole("button", { name: "Se connecter" }).click();
await page.waitForURL((url) => !url.pathname.includes("connexion"), { timeout: 30000 });
await page.waitForTimeout(2000);

const cookies = await context.cookies();
console.log("cookies visibles du contexte :");
for (const cookie of cookies) {
  if (!cookie.name.includes("auth-token")) continue;
  console.log(
    `  ${cookie.name} | httpOnly=${cookie.httpOnly} | domaine=${cookie.domain} | longueur=${cookie.value.length}`
  );
}

const inPage = await page.evaluate(() => document.cookie);
console.log("");
console.log("document.cookie lisible par le JS :");
console.log(`  ${inPage ? inPage.split("; ").join("\n  ") : "(vide)"}`);

const localStorageKeys = await page.evaluate(() => Object.keys(window.localStorage));
console.log("");
console.log(`localStorage : ${localStorageKeys.join(", ") || "(vide)"}`);

await context.close();
await browser.close();

process.exit(0);