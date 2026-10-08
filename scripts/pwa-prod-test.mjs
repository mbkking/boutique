import { chromium } from "playwright";

const APPS = [
  {
    name: "Client",
    url: "https://boutique-client-two.vercel.app",
    startUrl: "/",
    manifestStart: "/",
    manifestName: "ISF NAF-CHOPOP",
  },
  {
    name: "Admin",
    url: "https://boutique-admin-niger.vercel.app",
    startUrl: "/admin",
    manifestStart: "/admin",
    manifestName: "Administration",
  },
  {
    name: "Livreur",
    url: "https://livreur-nu.vercel.app",
    startUrl: "/driver",
    manifestStart: "/driver",
    manifestName: "Espace livreur",
  },
];

const results = [];
const ok = (name, pass, detail = "") => results.push(`${pass ? "OK " : "KO "} ${name}${detail ? " — " + detail : ""}`);
const browser = await chromium.launch();

for (const app of APPS) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const consoleErrors = [];
  p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  p.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)));

  // 1. Manifest
  const mfRes = await p.request.get(app.url + "/manifest.webmanifest");
  let mfOk = mfRes.status() === 200, mfDetail = `status=${mfRes.status()}`;
  if (mfOk) {
    try {
      const mf = await mfRes.json();
      const icons = mf.icons || [];
      mfOk = !!mf.name && !!mf.start_url && !!mf.display && icons.some((i) => i.sizes === "192x192") && icons.some((i) => i.sizes === "512x512");
      mfDetail += ` name="${mf.name}" start_url=${mf.start_url} display=${mf.display} icons=${icons.length} scope=${mf.scope}`;
      // Le manifest doit être celui de l'espace, pas celui de la boutique.
      if (app.manifestName) {
        const distinct = mf.name.includes(app.manifestName) && mf.start_url === app.manifestStart;
        if (!distinct) {
          mfOk = false;
          mfDetail += ` ATTENDU name~"${app.manifestName}" start_url=${app.manifestStart}`;
        }
      }
    } catch { mfOk = false; }
  }
  ok(`${app.name} manifest`, mfOk, mfDetail);

  // 2. Icônes
  for (const icon of ["/favicon.ico", "/apple-icon.png", "/icons/icon-192.png", "/icons/icon-512.png", "/sw.js", "/offline.html"]) {
    const r = await p.request.get(app.url + icon);
    ok(`${app.name} GET ${icon}`, r.status() === 200, `status=${r.status()}`);
  }

  // 3. Page de démarrage (start_url) + lien manifest + SW enregistré
  const resp = await p.goto(app.url + app.startUrl, { waitUntil: "networkidle", timeout: 45000 });
  ok(`${app.name} start_url ${app.startUrl}`, !!resp && resp.status() < 400, `status=${resp ? resp.status() : "?"}`);
  const manifestLink = await p.locator('link[rel="manifest"]').getAttribute("href").catch(() => null);
  ok(`${app.name} <link rel=manifest>`, !!manifestLink, manifestLink || "absent");
  const swRegistered = await p.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.length > 0 && regs.some((r) => !!r.active);
  });
  ok(`${app.name} service worker actif`, swRegistered);

  // 4. Fallback offline : couper le réseau, recharger → offline.html (page non pré-cachée)
  await ctx.setOffline(true);
  await p.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
  await p.waitForTimeout(1500);
  const offlineBody = await p.locator("body").innerText().catch(() => "");
  const offlineOk = /hors ligne|offline|connexion/i.test(offlineBody);
  ok(`${app.name} fallback offline`, offlineOk, JSON.stringify(offlineBody.slice(0, 100)));
  await ctx.setOffline(false);

  // 5. Viewports mobile → desktop sans erreur console
  for (const vp of [[360, 800], [768, 1024], [1920, 1080]]) {
    await p.setViewportSize({ width: vp[0], height: vp[1] });
    await p.goto(app.url + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(800);
    const scrollW = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(`${app.name} viewport ${vp[0]}x${vp[1]} pas de scroll horizontal`, scrollW <= vp[0] + 2, `scrollWidth=${scrollW}`);
  }

  ok(`${app.name} zéro erreur console (hors offline simulé)`, consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  await ctx.close();
}

// 6. Auth transverse en prod
const ctx = await browser.newContext();
const p = await ctx.newPage();
for (const app of [APPS[1], APPS[2]]) {
  await p.goto(app.url + app.startUrl, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1500);
  ok(`${app.name} anonyme redirigé vers /connexion`, p.url().includes("/connexion") && p.url().includes("returnTo"), p.url());
}
// Client : login + logout rapide.
// On attend le réseau (hydration React) AVANT de remplir/clicker : un
// remplissage trop précoce soumet le formulaire en GET natif (?email=...)
// et le test échoue à tort.
await p.goto(APPS[0].url + "/connexion", { waitUntil: "networkidle", timeout: 45000 });
await p.locator("input[type=email]").first().waitFor({ state: "visible", timeout: 15000 });
await p.waitForTimeout(1000);
await p.locator("input[type=email]").first().fill("qa.prod.1791481349445@exemple.ne");
await p.locator("input[type=password]").first().fill("Test12345");
await p.locator("button[type=submit]").first().click();
await p.waitForTimeout(15000);
ok("Client login prod", p.url().includes("/compte"), p.url());
await p.goto(APPS[0].url + "/compte", { waitUntil: "networkidle" });
const logoutBtn = p.locator("button", { hasText: /se déconnecter/i }).first();
if (await logoutBtn.count()) {
  await logoutBtn.click();
  await p.waitForTimeout(4000);
  ok("Client logout prod", !p.url().includes("/compte"), p.url());
} else ok("Client logout prod", false, "bouton absent");

// 7. Admin : login refus client + session admin existante non testée (credentials admin dispo)
await p.goto(APPS[1].url + "/admin", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);
ok("Admin prod anonyme redirigé", p.url().includes("/connexion"), p.url());

await browser.close();
console.log(results.join("\n"));
const kos = results.filter((x) => x.startsWith("KO"));
console.log(kos.length === 0 ? "\nCAMPAGNE PWA PROD: TOUS OK" : `\nCAMPAGNE PWA PROD: ${kos.length} ÉCHEC(S)`);
