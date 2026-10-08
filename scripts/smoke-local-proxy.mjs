import { chromium } from "playwright";

const base = "http://localhost:4000";
const results = [];
const ok = (name, pass, detail = "") => results.push(`${pass ? "OK " : "KO "} ${name}${detail ? " — " + detail : ""}`);

const b = await chromium.launch();
const p = await b.newPage();
p.on("console", (m) => {
  if (m.type() === "error") results.push(`CONSOLE-ERROR: ${m.text().slice(0, 200)}`);
});

// 1. Accueil
let r = await p.goto(base + "/", { waitUntil: "domcontentloaded" });
ok("GET /", r.status() === 200, `status=${r.status()}`);

// 2. /compte anonyme : rendu inline (formulaire login, pas de redirection forcée)
r = await p.goto(base + "/compte", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);
const compteBody = await p.locator("body").innerText();
ok("/compte anonyme rendu", r.status() === 200 && p.url().endsWith("/compte") && /connexion|mot de passe|e-mail|adresse/i.test(compteBody), `url=${p.url()} status=${r.status()} excerpt=${JSON.stringify(compteBody.slice(0, 120))}`);

// 3. /admin anonyme -> /connexion?returnTo
r = await p.goto(base + "/admin", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1000);
ok("/admin anonyme redirigé", p.url().includes("/connexion") && p.url().includes("returnTo"), p.url());

// 4. /driver anonyme
await p.goto(base + "/driver", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1000);
ok("/driver anonyme redirigé", p.url().includes("/connexion") && p.url().includes("returnTo"), p.url());

// 5. /livreur anonyme
await p.goto(base + "/livreur", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1000);
ok("/livreur anonyme redirigé", p.url().includes("/connexion") && p.url().includes("returnTo"), p.url());

// 6. Connexion cliente
// Attendre l'hydration (réseau) avant de remplir : un click précoce
// soumet le formulaire en GET natif et échoue à tort.
await p.goto(base + "/connexion", { waitUntil: "networkidle", timeout: 45000 });
await p.locator("input[type=email]").first().waitFor({ state: "visible", timeout: 15000 });
await p.waitForTimeout(1000);
await p.locator("input[type=email]").first().fill("qa.prod.1791481349445@exemple.ne");
await p.locator("input[type=password]").first().fill("Test12345");
await p.locator("button[type=submit]").first().click();
await p.waitForTimeout(15000);
ok("Connexion cliente", p.url().includes("/compte"), p.url());

// 7. /admin en cliente -> refus
r = await p.goto(base + "/admin", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1000);
ok("Cliente bloquée sur /admin", p.url().includes("erreur") || p.url().includes("/compte"), p.url());

// 8. /driver en cliente -> refus
await p.goto(base + "/driver", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1000);
ok("Cliente bloquée sur /driver", p.url().includes("erreur") || p.url().includes("/compte"), p.url());

// 9. /compte connectée
r = await p.goto(base + "/compte", { waitUntil: "networkidle" });
const body = await p.locator("body").innerText();
ok("/compte connectée", r.status() === 200 && /Mes informations|QA Prod/i.test(body), `status=${r.status()}`);

// 10. /connexion connectée -> déjà connecté redirigé
await p.goto(base + "/connexion", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1000);
ok("/connexion connectée redirigée", !p.url().includes("/connexion") || p.url().includes("/compte"), p.url());

// 11. Pages publiques
r = await p.goto(base + "/categories", { waitUntil: "domcontentloaded" });
ok("/categories", r.status() === 200, `status=${r.status()}`);
r = await p.goto(base + "/mot-de-passe-oublie", { waitUntil: "domcontentloaded" });
ok("/mot-de-passe-oublie connectée redirigée", !p.url().includes("/mot-de-passe-oublie"), p.url());

// 12. PWA assets
for (const [path, extra] of [["/sw.js", null], ["/offline.html", null], ["/manifest.webmanifest", "json"], ["/favicon.ico", null], ["/apple-icon.png", null]]) {
  const res = await p.request.get(base + path);
  let detail = `status=${res.status()}`;
  let pass = res.status() === 200;
  if (extra === "json" && pass) {
    try { const j = await res.json(); pass = !!j.name && Array.isArray(j.icons) && j.icons.length >= 2; detail += ` start_url=${j.start_url}`; } catch { pass = false; }
  }
  ok(`GET ${path}`, pass, detail);
}

// 13. Déconnexion
await p.goto(base + "/compte", { waitUntil: "networkidle" });
const logout = p.locator("button", { hasText: /se déconnecter/i }).first();
if (await logout.count()) {
  await logout.click();
  await p.waitForTimeout(4000);
  ok("Déconnexion", !p.url().includes("/compte"), p.url());
} else {
  ok("Déconnexion (bouton)", false, "bouton introuvable");
}

// 14. Après déconnexion, /admin redirige
await p.goto(base + "/admin", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1000);
ok("Post-déconnexion /admin redirigé", p.url().includes("/connexion"), p.url());

// 15. Espace-indisponible / offline rendus directement
r = await p.request.get(base + "/espace-indisponible?espace=admin");
ok("/espace-indisponible", r.status() === 200, `status=${r.status()}`);

await b.close();
console.log(results.join("\n"));
const kos = results.filter((x) => x.startsWith("KO"));
console.log(kos.length === 0 ? "SMOKE PROD-LIKE: TOUS OK" : `SMOKE PROD-LIKE: ${kos.length} ÉCHEC(S)`);
