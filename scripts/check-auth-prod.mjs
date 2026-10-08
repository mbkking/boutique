import { chromium } from "playwright";

const URLS = {
  admin: "https://boutique-admin-niger.vercel.app",
  livreur: "https://livreur-nu.vercel.app",
};

const results = [];
const ok = (name, pass, detail = "") => results.push(`${pass ? "OK " : "KO "} ${name}${detail ? " — " + detail : ""}`);
const browser = await chromium.launch();

async function loginAndLogout(appUrl, email, password, expectPath) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 120)); });
  await p.goto(appUrl + "/connexion?returnTo=" + encodeURIComponent(expectPath), { waitUntil: "networkidle", timeout: 45000 });
  await p.locator("input[type=email]").first().waitFor({ state: "visible", timeout: 15000 });
  await p.waitForTimeout(800);
  await p.locator("input[type=email]").first().fill(email);
  await p.locator("input[type=password]").first().fill(password);
  await p.locator("button[type=submit]").first().click();
  await p.waitForTimeout(15000);
  ok(`${email.split("@")[0]} URL ${expectPath}`, p.url().includes(expectPath), p.url());
  return { ctx, p, errs };
}

// ---- ADMIN : sidebar, menu utilisateur, logout, re-protection ----
{
  const { ctx, p, errs } = await loginAndLogout(URLS.admin, "admin.test@exemple.ne", "Adm25-7f3c9a1e4b", "/admin");
  ok("admin sidebar 'ISF NAF-CHOPOP Admin'", (await p.getByText("ISF NAF-CHOPOP Admin").count()) > 0, "");
  ok("admin nav 'Tableau de bord'", (await p.getByText("Tableau de bord", { exact: true }).count()) > 0, "");
  ok("admin nav 'Commandes'", (await p.getByText("Commandes", { exact: true }).count()) > 0, "");
  ok("admin rôle affiché", (await p.getByText("Administrateur", { exact: true }).count()) > 0, "Administrateur");

  const avatar = p.locator(".admin-theme header button[aria-expanded]").first();
  if (await avatar.count()) {
    await avatar.click();
    await p.waitForTimeout(800);
    const signOut = p.getByText("Se déconnecter", { exact: true });
    ok("admin bouton Se déconnecter", (await signOut.count()) > 0, "");
    if (await signOut.count()) {
      await signOut.click();
      await p.waitForTimeout(5000);
      ok("admin logout → /connexion", p.url().includes("/connexion"), p.url());
    }
  } else {
    ok("admin menu utilisateur", false, "avatar introuvable");
  }

  await p.goto(URLS.admin + "/admin", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  ok("admin post-logout /admin → /connexion", p.url().includes("/connexion"), p.url());
  ok("admin zéro erreur console", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ---- LIVREUR : espace, profil (logout), re-protection ----
{
  const { ctx, p, errs } = await loginAndLogout(URLS.livreur, "bassirouyahayamoubarak20@gmail.com", "NstMqDHspRVBjX!7", "/driver");
  const body = await p.locator("body").innerText().catch(() => "");
  ok("livreur espace (Missions/Livraisons)", /Mes livraisons|Historique|Tableau de bord/i.test(body), body.replace(/\n+/g, " | ").slice(0, 160));

  await p.goto(URLS.livreur + "/driver/profil", { waitUntil: "networkidle", timeout: 45000 });
  await p.waitForTimeout(1500);
  const signOut = p.getByText("Se déconnecter", { exact: true }).first();
  ok("livreur bouton Se déconnecter", (await signOut.count()) > 0, "");
  if (await signOut.count()) {
    await signOut.click();
    await p.waitForTimeout(5000);
    ok("livreur logout", !p.url().includes("/driver"), p.url());
  }

  await p.goto(URLS.livreur + "/driver", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  ok("livreur post-logout /driver → /connexion", p.url().includes("/connexion"), p.url());
  ok("livreur zéro erreur console", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

console.log(results.join("\n"));
const kos = results.filter((x) => x.startsWith("KO"));
console.log(kos.length === 0 ? "\nADMIN + LIVREUR AUTH PROD: TOUS OK" : `\nADMIN + LIVREUR AUTH PROD: ${kos.length} ÉCHEC(S)`);
await browser.close();
if (kos.length) process.exit(1);