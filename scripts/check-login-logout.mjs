import { chromium } from "playwright";

const b = await chromium.launch();
const p = await b.newPage();
const base = "https://boutique-client-two.vercel.app";

// 1. Connexion compte existant
await p.goto(base + "/connexion", { waitUntil: "networkidle" });
await p.locator("input[type=email]").first().fill("qa.prod.1791481349445@exemple.ne");
await p.locator("input[type=password]").first().fill("Test12345");
await p.locator("button[type=submit]").first().click();
await p.waitForTimeout(5000);
console.log("apres connexion:", p.url());

// 2. Accès protégé sans session simulé (déjà connecté)
await p.goto(base + "/compte", { waitUntil: "networkidle" });
const body = (await p.locator("body").innerText()).slice(0, 200);
console.log("compte:", body.replace(/\n+/g, " | "));

// 3. Déconnexion
const logout = p.locator("button", { hasText: /se déconnecter/i }).first();
if (await logout.count()) {
  await logout.click();
  await p.waitForTimeout(4000);
  console.log("apres deconnexion:", p.url());
  await p.goto(base + "/compte", { waitUntil: "networkidle" });
  console.log("compte deconnecte:", p.url());
} else {
  console.log("bouton deconnexion introuvable");
}

// 4. Accès protégé déconnecté -> redirection connexion
console.log("body final:", (await p.locator("body").innerText()).slice(0, 120).replace(/\n+/g, " | "));
await b.close();
