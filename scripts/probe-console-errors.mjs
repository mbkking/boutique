/**
 * Relevé des erreurs console sur les pages client.
 *
 * Sert à distinguer un problème préexistant d'une régression.
 *
 * Usage : node scripts/probe-console-errors.mjs
 */

import { chromium } from "playwright";

const PAGES = ["/", "/categories", "/categories/meubles"];

const browser = await chromium.launch();

for (const width of [390, 1440]) {
  for (const path of PAGES) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();

    const errors = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      errors.push(message.text().replace(/\s+/g, " ").slice(0, 200));
    });
    page.on("pageerror", (error) => errors.push(`page: ${error.message.slice(0, 200)}`));

    await page.goto(`http://localhost:3000${path}`, { waitUntil: "load" });
    await page.waitForTimeout(3000);

    console.log(`${width}px ${path}`);
    console.log(`  ${errors.length === 0 ? "aucune erreur console" : errors.join("\n  ")}`);
    await context.close();
  }
}

await browser.close();

process.exit(0);