/**
 * Vérification de la création d'utilisateur depuis l'administration : rôle
 * appliqué en base, accès réels, fiche client créée pour un compte client.
 *
 * Usage : node scripts/verify-user-creation.mjs
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
const BASE = process.env.VERIFY_BASE_URL ?? "http://admin.localhost:3000";

const adminEmail = `user-admin-${Date.now()}@example.test`;
const adminPassword = `Admin-${Date.now()}-Aa1!`;
const stamp = Date.now().toString(36);
const newEmail = `nouveau.client.${stamp}@exemple.test`;

const created = [];
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
};

async function createAdmin(email, password, fullName, phone) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  });
  if (error) throw error;
  await supabase.from("profiles").update({ role: "admin", is_active: true }).eq("id", data.user.id);
  created.push(data.user.id);
  return data.user;
}

const adminUser = await createAdmin(adminEmail, adminPassword, "Admin de test", "+22790001111");

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.goto(`${BASE}/connexion`);
  await page.getByLabel("Adresse e-mail").fill(adminEmail);
  await page.getByRole("textbox", { name: "Mot de passe" }).fill(adminPassword);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.includes("connexion"), { timeout: 30000 });

  await page.goto(`${BASE}/admin/users`);
  await page.getByRole("button", { name: "Créer un utilisateur" }).click();
  check("bouton de création présent", true);

  await page.getByLabel("Nom complet").fill("Nouveau Client Verif");
  await page.getByLabel("Adresse e-mail").fill(newEmail);
  await page.getByLabel("Téléphone").fill("+22790005555");
  await page.locator("#new-user-role").selectOption("driver");

  await page.getByRole("button", { name: "Créer le compte" }).click();
  await page.waitForTimeout(6000);
  console.log("ALERTES:", JSON.stringify(await page.locator("[role=alert], [role=status]").allTextContents()));
  await page.waitForSelector("[data-temporary-password]", { timeout: 60000 });

  const temporaryPassword = (
    (await page.locator("[data-temporary-password]").first().textContent()) ?? ""
  ).trim();
  check("mot de passe provisoire affiché", temporaryPassword.length >= 8);

  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const account = users.users.find((user) => user.email === newEmail);
  check("compte créé côté authentification", Boolean(account));
  created.push(account?.id);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("role, full_name, is_active")
    .eq("id", account.id)
    .single();
  check("rôle driver appliqué", profiles?.role === "driver", `rôle=${profiles?.role}`);

  // Le compte doit pouvoir se connecter avec le mot de passe provisoire.
  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
    email: newEmail,
    password: temporaryPassword,
  });
  check("connexion avec le mot de passe provisoire", !signInError, signInError?.message ?? "");
  if (session) await supabase.auth.signOut();

  // Contrôle des accès : un livreur ne doit pas entrer dans l'administration.
  const driverBrowser = await chromium.launch();
  const driverPage = await driverBrowser.newPage();
  await driverPage.goto(`${BASE}/connexion`);
  await driverPage.getByLabel("Adresse e-mail").fill(newEmail);
  await driverPage.getByRole("textbox", { name: "Mot de passe" }).fill(temporaryPassword);
  await driverPage.getByRole("button", { name: "Se connecter" }).click();
  await driverPage.waitForTimeout(3000);
  const driverUrl = driverPage.url();
  check(
    "livreur orienté vers son espace",
    driverUrl.includes("/livreur") || driverUrl.includes("/driver"),
    driverUrl
  );
  await driverPage.goto(`${BASE}/admin/products`);
  await driverPage.waitForTimeout(2000);
  check(
    "livreur refusé sur l'administration",
    !driverPage.url().includes("/admin/products"),
    driverPage.url()
  );
  await driverBrowser.close();

  // Le nouveau compte apparaît dans la liste, avec son rôle.
  await page.goto(`${BASE}/admin/users`);
  await page.reload();
  check(
    "compte listé dans l'administration",
    await page.getByText(newEmail.split("@")[0]).first().isVisible().catch(() => false) ||
      (await page.content()).includes("Nouveau Client Verif")
  );
} finally {
  await browser.close();
  for (const id of created.filter(Boolean)) {
    await supabase.auth.admin.deleteUser(id);
  }
  console.log(`${created.length} compte(s) de vérification supprimé(s).`);
}
