/**
 * Preuve navigateur de l'état du CSS.
 *
 * Aucune déduction : on mesure ce que le navigateur reçoit réellement et ce
 * qu'il applique réellement.
 *
 *   - requêtes CSS (URL, statut, type, taille)
 *   - nombre de feuilles de style réellement attachées
 *   - application effective des utilitaires Tailwind sur un élément de test
 *
 * Usage : node scripts/probe-css.mjs
 */

import { chromium } from "playwright";

const APPS = {
  client: "http://localhost:3000",
  admin: "http://localhost:3002",
  driver: "http://localhost:3003",
};

const browser = await chromium.launch();

for (const [name, base] of Object.entries(APPS)) {
  const context = await browser.newContext();
  const page = await context.newPage();

  const cssRequests = [];
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes(".css")) return;

    cssRequests.push({
      status: response.status(),
      type: response.headers()["content-type"] ?? "(aucun)",
      url: url.replace(base, ""),
    });
  });

  const failures = [];
  page.on("requestfailed", (request) => failures.push(`${request.url()} — ${request.failure()?.errorText}`));
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text().slice(0, 160)}`);
  });

  await page.goto(base, { waitUntil: "load" });
  await page.waitForTimeout(2500);

  // Un élément de test isolé : sa couleur ne peut venir que d'une utility.
  const computed = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "bg-primary rounded-xl shadow-sm bg-white text-white p-4 flex text-3xl font-bold";
    probe.textContent = "TAILWIND";
    document.body.appendChild(probe);

    const style = window.getComputedStyle(probe);
    const result = {
      background: style.backgroundColor,
      color: style.color,
      padding: style.paddingTop,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      display: style.display,
      bodyDisplay: window.getComputedStyle(document.body).display,
    };

    probe.remove();
    return result;
  });

  const origin = base;
  const sheets = await page.evaluate((siteOrigin) =>
    [...document.styleSheets].map((sheet) => {
      let rules = "illisible";
      try {
        rules = String(sheet.cssRules.length);
      } catch {
        rules = "accès refusé";
      }
      return `${sheet.href ? sheet.href.replace(siteOrigin, "") : "(inline)"} — ${rules} règle(s)`;
    })
  , origin);

  console.log(`\n===== ${name.toUpperCase()} (${base})`);
  console.log(`feuilles attachées au document : ${sheets.length}`);
  for (const sheet of sheets) console.log(`  ${sheet}`);
  console.log(`requêtes CSS : ${cssRequests.length}`);
  for (const request of cssRequests) {
    console.log(`  ${request.status} | ${request.type} | ${request.url}`);
  }
  console.log(`utilitaires appliquées sur bg-red-500 text-white p-8 text-3xl font-bold :`);
  console.log(`  background-color = ${computed.background}`);
  console.log(`  color            = ${computed.color}`);
  console.log(`  padding-top      = ${computed.padding}`);
  console.log(`  font-size        = ${computed.fontSize}`);
  console.log(`  font-weight      = ${computed.fontWeight}`);
  console.log(`  body display     = ${computed.bodyDisplay}`);
  const tailwindWorks =
    computed.background !== "rgba(0, 0, 0, 0)" && computed.padding !== "0px" && computed.fontSize !== "16px";
  console.log(`=> Tailwind appliqué : ${tailwindWorks ? "OUI" : "NON"}`);
  if (failures.length > 0) {
    console.log("erreurs relevées :");
    for (const failure of failures.slice(0, 5)) console.log(`  ${failure}`);
  }

  await context.close();
}

await browser.close();

process.exit(0);