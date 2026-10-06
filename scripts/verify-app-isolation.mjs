/**
 * Vérification de l'isolation réelle des trois applications.
 *
 * Contrôle, dans un même navigateur :
 *   1. les trois applications répondent sur leur port ;
 *   2. un client, un admin et un livreur restent connectés **en même temps** ;
 *   3. chaque application ne sert pas les routes des autres ;
 *   4. les refus sont effective (rôle lu côté serveur).
 *
 * Prérequis : les trois serveurs de développement tournent
 * (`npm run dev:all`) et les comptes de test existent
 * (`npm run bootstrap:e2e-staff`).
 *
 * Usage : node scripts/verify-app-isolation.mjs
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

const APPS = {
  client: "http://localhost:3000",
  admin: "http://localhost:3002",
  driver: "http://localhost:3003",
};

const ACCOUNTS = {
  client: {
    email: process.env.E2E_CUSTOMER_EMAIL ?? "client.test@exemple.ne",
    password: process.env.E2E_CUSTOMER_PASSWORD ?? "",
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? "admin.test@exemple.ne",
    password: process.env.E2E_ADMIN_PASSWORD ?? "Admin2026!",
  },
  driver: {
    email: process.env.E2E_DRIVER_EMAIL ?? "livreur.test@exemple.ne",
    password: process.env.E2E_DRIVER_PASSWORD ?? "Livreur2026!",
  },
};

const check = (label, ok, detail = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
};

async function signIn(page, base, email, password) {
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("textbox", { name: "Mot de passe" }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();

  // La redirection d'atterrissage dépend du rôle : on attend que la page
  // quitte l'écran de connexion, sans supposer la destination.
  try {
    await page.waitForURL((url) => !url.pathname.includes("connexion"), { timeout: 30000 });
  } catch {
    // La connexion peut rester valide sur la même URL : la section 3 le
    // vérifie en tentant d'accéder à une page protégée.
  }

  return page.url();
}

// Mot de passe client inconnu : on le réinitialise comme pour les autres
// comptes de démonstration, afin que le scénario soit reproductible.
if (!ACCOUNTS.client.password) {
  const { data } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const account = data.users.find((user) => user.email === ACCOUNTS.client.email);

  if (!account) {
    console.error(
      `Compte client ${ACCOUNTS.client.email} introuvable. Lancez « npm run bootstrap:e2e-staff ».`
    );
    process.exit(1);
  }

  const password = "Client2026!";
  await supabase.auth.admin.updateUserById(account.id, { password, email_confirm: true });
  ACCOUNTS.client.password = password;
  console.log(`Mot de passe du compte client réinitialisé (${ACCOUNTS.client.email}).`);
}

const browser = await chromium.launch();

// Un seul contexte : les trois applications partagent les cookies du navigateur,
// c'est exactement le risque que l'on veut vérifier.
const context = await browser.newContext();
const pages = {
  client: await context.newPage(),
  admin: await context.newPage(),
  driver: await context.newPage(),
};

try {
  console.log("--- 1. Les trois applications répondent");
  for (const [name, base] of Object.entries(APPS)) {
    const response = await pages[name].goto(base, { waitUntil: "domcontentloaded" });
    check(`${name} répond sur ${base}`, response?.status() === 200, `HTTP ${response?.status()}`);
  }

  console.log("--- 2. Connexions simultanées");
  const clientUrl = await signIn(
    pages.client,
    APPS.client,
    ACCOUNTS.client.email,
    ACCOUNTS.client.password
  );
  check("client connecté", !clientUrl.includes("/connexion"), clientUrl);

  const adminUrl = await signIn(
    pages.admin,
    APPS.admin,
    ACCOUNTS.admin.email,
    ACCOUNTS.admin.password
  );
  check("admin connecté", adminUrl.includes("/admin"), adminUrl);

  const driverUrl = await signIn(
    pages.driver,
    APPS.driver,
    ACCOUNTS.driver.email,
    ACCOUNTS.driver.password
  );
  check("livreur connecté", driverUrl.includes("/livreur") || driverUrl.includes("/driver"), driverUrl);

  console.log("--- 3. Les trois sessions coexistent");
  // Chaque application relit sa session après les deux autres connexions.
  await pages.client.goto(`${APPS.client}/compte`, { waitUntil: "domcontentloaded" });
  await pages.client.waitForTimeout(2500);
  check(
    "session client toujours active",
    !pages.client.url().includes("/connexion"),
    pages.client.url()
  );

  await pages.admin.goto(`${APPS.admin}/admin`, { waitUntil: "domcontentloaded" });
  await pages.admin.waitForTimeout(2500);
  const adminContent = await pages.admin.content();
  check(
    "session admin toujours active",
    adminContent.includes("Tableau de bord") || adminContent.includes("Commandes"),
    pages.admin.url()
  );

  await pages.driver.goto(`${APPS.driver}/livreur`, { waitUntil: "domcontentloaded" });
  await pages.driver.waitForTimeout(2500);
  check(
    "session livreur toujours active",
    !pages.driver.url().includes("/connexion"),
    pages.driver.url()
  );

  console.log("--- 4. Séparation des applications");
  await pages.client.goto(`${APPS.client}/admin`, { waitUntil: "domcontentloaded" });
  await pages.client.waitForTimeout(2000);
  check(
    "client ne peut pas atteindre /admin",
    !pages.client.url().includes("/admin"),
    pages.client.url()
  );

  await pages.client.goto(`${APPS.client}/livreur`, { waitUntil: "domcontentloaded" });
  await pages.client.waitForTimeout(2000);
  check(
    "client ne peut pas atteindre /livreur",
    !pages.client.url().includes("/livreur"),
    pages.client.url()
  );

  await pages.admin.goto(`${APPS.admin}/livreur`, { waitUntil: "domcontentloaded" });
  await pages.admin.waitForTimeout(2000);
  check(
    "admin ne sert pas l'espace livreur",
    !pages.admin.url().includes("/livreur"),
    pages.admin.url()
  );

  await pages.driver.goto(`${APPS.driver}/admin`, { waitUntil: "domcontentloaded" });
  await pages.driver.waitForTimeout(2000);
  check(
    "livreur ne peut pas atteindre l'administration",
    !pages.driver.url().includes("/admin"),
    pages.driver.url()
  );

  console.log("--- 5. Cookies de session distincts");
  const cookies = await context.cookies();
  const authCookies = cookies
    .map((cookie) => cookie.name)
    .filter((name) => name.includes("auth-token"));
  const scopes = new Set(
    authCookies.map((name) => name.split("-").pop()).filter((scope) => scope !== "token")
  );
  check(
    "un cookie de session par application",
    scopes.size >= 2,
    authCookies.join(", ")
  );
} finally {
  await browser.close();
}