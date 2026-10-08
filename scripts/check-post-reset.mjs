import { chromium } from "playwright";

const results = [];
const ok = (name, pass, detail = "") => results.push(`${pass ? "OK " : "KO "} ${name}${detail ? " — " + detail : ""}`);
const browser = await chromium.launch();

async function probe(name, url) {
  const p = await browser.newPage();
  const errs = [];
  const httpErr = [];
  const abortedRsc = [];
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });
  p.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("_rsc")) httpErr.push(r.status() + " " + r.url().slice(0, 70)); });
  await p.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await p.waitForTimeout(1200);
  const status = await p.evaluate(() => document.body ? (document.querySelector("body")?.innerText || "").slice(0, 60) : "");
  ok(name + " rendu", status.length > 0, status.replace(/\s+/g, " ").slice(0, 60));
  ok(name + " zéro erreur console", errs.length === 0, errs.join(" | "));
  ok(name + " zéro 4xx/5xx (hors artefacts _rsc)", httpErr.length === 0, httpErr.join(" | "));
  await p.close();
}

await probe("Client /", "https://boutique-client-two.vercel.app/");
await probe("Client /categories", "https://boutique-client-two.vercel.app/categories");
await probe("Client /search", "https://boutique-client-two.vercel.app/search");
await probe("Client /products", "https://boutique-client-two.vercel.app/products");
await probe("Client /connexion", "https://boutique-client-two.vercel.app/connexion");
await probe("Client /inscription", "https://boutique-client-two.vercel.app/inscription");
await probe("Admin /admin (anonyme)", "https://boutique-admin-niger.vercel.app/admin");
await probe("Livreur /driver (anonyme)", "https://livreur-nu.vercel.app/driver");

// Déconnexion/redirect : après login client l'espaces reste protégé
{
  const p = await browser.newPage();
  const errs = [];
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 120)); });
  await p.goto("https://boutique-client-two.vercel.app/connexion", { waitUntil: "networkidle" });
  await p.locator("input[type=email]").first().waitFor({ state: "visible", timeout: 15000 });
  await p.waitForTimeout(500);
  await p.locator("input[type=email]").first().fill("qa.prod.1791481349445@exemple.ne");
  await p.locator("input[type=password]").first().fill("Test12345");
  await p.locator("button[type=submit]").first().click();
  await p.waitForTimeout(12000);
  ok("Client login → /compte", p.url().includes("/compte"), p.url());
  ok("Client login sans erreur console", errs.length === 0, errs.join(" | "));
  await p.close();
}

console.log(results.join("\n"));
const kos = results.filter((x) => x.startsWith("KO"));
console.log(kos.length === 0 ? "\nPOST-RESET PROD: TOUS OK" : `\nPOST-RESET PROD: ${kos.length} ÉCHEC(S)`);
await browser.close();
if (kos.length) process.exit(1);