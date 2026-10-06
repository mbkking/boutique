/**
 * Vérifie le comportement de l'autoplay selon `prefers-reduced-motion`.
 *
 * - réduit : aucun défilement automatique
 * - normal  : défilement automatique carte par carte
 *
 * Usage : node scripts/probe-category-reduced-motion.mjs
 */

import { chromium } from "playwright";

const URL = "http://localhost:3000";
const SELECTOR = '[aria-label^="Catégories, faites défiler"]';

const browser = await chromium.launch();

for (const reducedMotion of ["reduce", "no-preference"]) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion,
  });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForSelector(SELECTOR);
  await page.waitForTimeout(800);

  const before = await page.evaluate((selector) => document.querySelector(selector).scrollLeft, SELECTOR);
  await page.waitForTimeout(4600);
  const after = await page.evaluate((selector) => document.querySelector(selector).scrollLeft, SELECTOR);

  console.log(`prefers-reduced-motion: ${reducedMotion}`);
  console.log(`  scrollLeft ${Math.round(before)} -> ${Math.round(after)}`);
  console.log(`  autoplay ${after > before + 5 ? "ACTIF (attendu si no-preference)" : "INACTIF (attendu si reduce)"}`);
  console.log("");

  await context.close();
}

await browser.close();

process.exit(0);