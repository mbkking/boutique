/**
 * Contrôle du design sur des éléments réels de chaque application.
 *
 * Un CSS présent ne suffit pas : on mesure si les classes utilisées par les
 * composants produisent réellement leur effet (fond, rayon, ombre, couleur).
 *
 * Usage : node scripts/probe-css-design.mjs
 */

import { chromium } from "playwright";

const APPS = {
  client: { url: "http://localhost:3000", path: "/" },
  admin: { url: "http://localhost:3002", path: "/connexion" },
  driver: { url: "http://localhost:3003", path: "/connexion" },
};

const browser = await chromium.launch();

for (const [name, app] of Object.entries(APPS)) {
  const context = await browser.newContext();
  const page = await context.newPage();

  const cssErrors = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/css|stylesheet|Failed to load/i.test(text)) cssErrors.push(text.slice(0, 160));
  });
  page.on("response", (response) => {
    if (response.url().includes(".css") && response.status() >= 400) {
      cssErrors.push(`CSS ${response.status()} ${response.url()}`);
    }
  });

  await page.goto(`${app.url}${app.path}`, { waitUntil: "load" });
  await page.waitForTimeout(2500);

  const report = await page.evaluate(() => {
    const radiusElements = [...document.querySelectorAll('[class*="rounded-"]')].slice(0, 40);
    const backgroundElements = [...document.querySelectorAll('[class*="bg-"]')].slice(0, 40);
    const shadowElements = [...document.querySelectorAll('[class*="shadow-"]')].slice(0, 40);

    const transparent = "rgba(0, 0, 0, 0)";

    const styledRadius = radiusElements.filter(
      (element) => Number.parseFloat(window.getComputedStyle(element).borderTopLeftRadius) > 0
    ).length;
    const styledBackground = backgroundElements.filter(
      (element) => window.getComputedStyle(element).backgroundColor !== transparent
    ).length;
    const styledShadow = shadowElements.filter(
      (element) => window.getComputedStyle(element).boxShadow !== "none"
    ).length;

    const html = document.documentElement;
    const body = document.body;

    return {
      total: document.querySelectorAll("*").length,
      radius: { total: radiusElements.length, styled: styledRadius },
      background: { total: backgroundElements.length, styled: styledBackground },
      shadow: { total: shadowElements.length, styled: styledShadow },
      htmlBackground: window.getComputedStyle(html).backgroundColor,
      bodyBackground: window.getComputedStyle(body).backgroundColor,
      bodyFont: window.getComputedStyle(body).fontFamily.slice(0, 60),
      aosPresent: typeof window.AOS !== "undefined",
      aosAnimated: document.querySelectorAll("[data-aos]").length,
      sheets: document.styleSheets.length,
    };
  });

  const ok =
    report.radius.styled > 0 && report.background.styled > 0 && report.shadow.styled > 0;

  console.log(`\n===== ${name.toUpperCase()} ${app.url}${app.path}`);
  console.log(`  éléments DOM            : ${report.total}`);
  console.log(`  classes bg-* stylées    : ${report.background.styled}/${report.background.total}`);
  console.log(`  classes rounded-*       : ${report.radius.styled}/${report.radius.total}`);
  console.log(`  classes shadow-*        : ${report.shadow.styled}/${report.shadow.total}`);
  console.log(`  fond body               : ${report.bodyBackground}`);
  console.log(`  police body             : ${report.bodyFont}`);
  console.log(`  AOS présent / [data-aos]: ${report.aosPresent} / ${report.aosAnimated}`);
  console.log(`  feuilles attachées      : ${report.sheets}`);
  console.log(`  => design appliqué : ${ok ? "OUI" : "NON"}`);
  console.log(`  erreurs CSS             : ${cssErrors.length === 0 ? "aucune" : cssErrors.join(" | ")}`);

  await context.close();
}

await browser.close();

process.exit(0);