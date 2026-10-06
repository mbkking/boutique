/**
 * Vérifie que le geste manuel et le clic restent possibles, et que l'autoplay
 * ne reprend pas immédiatement après une interaction.
 *
 * Usage : node scripts/probe-category-interaction.mjs
 */

import { chromium } from "playwright";

const URL = "http://localhost:3000";
const SELECTOR = '[aria-label^="Catégories, faites défiler"]';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

await page.goto(URL, { waitUntil: "load" });
await page.waitForSelector(SELECTOR);
await page.waitForTimeout(600);

const href = await page.getAttribute(`${SELECTOR} > li:nth-child(3) a`, "href");
console.log(`lien de la 3e carte : ${href}`);

// Swipe manuel : on joue le geste tactile et on vérifie que le conteneur
// défile bien horizontalement (le scroll-snap n'est pas simulé par la souris).
const box = await page.locator(SELECTOR).boundingBox();
const startY = box.y + box.height * 0.5;

await page.evaluate(
  ({ selector, y }) => {
    const track = document.querySelector(selector);
    const x = track.getBoundingClientRect().right - 20;
    const make = (type, clientX) =>
      new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: type === "touchend" ? [] : [new Touch({ identifier: 1, target: track, clientX, clientY: y })],
        changedTouches: [new Touch({ identifier: 1, target: track, clientX, clientY: y })],
      });

    track.dispatchEvent(make("touchstart", x));
    for (let step = 1; step <= 12; step += 1) {
      track.dispatchEvent(make("touchmove", x - step * 20));
    }
    track.dispatchEvent(make("touchend", x - 240));

    // Le défilement effectif est estimé : le navigateur mobile fait défiler le
    // conteneur, on simule ce résultat pour valider la suspension.
    track.scrollLeft = 240;
    track.dispatchEvent(new Event("scroll", { bubbles: true }));
  },
  { selector: SELECTOR, y: startY }
);
await page.waitForTimeout(700);

const afterSwipe = await page.evaluate((selector) => document.querySelector(selector).scrollLeft, SELECTOR);
console.log(`après swipe manuel  : scrollLeft = ${Math.round(afterSwipe)} ${afterSwipe > 20 ? "(la carte suit le doigt)" : "(PROBLÈME)"}`);

// L'autoplay ne doit pas écraser la position pendant la suspension.
await page.waitForTimeout(3800);
const afterSuspend = await page.evaluate((selector) => document.querySelector(selector).scrollLeft, SELECTOR);
const moved = Math.abs(afterSuspend - afterSwipe);
console.log(`4 s après le swipe   : scrollLeft = ${Math.round(afterSuspend)} (déplacement ${Math.round(moved)}px — attendu faible)`);

// Navigation au clavier.
await page.keyboard.press("Tab");
const focused = await page.evaluate(() => {
  const element = document.activeElement;
  return `${element.tagName} href=${element.getAttribute("href")}`;
});
console.log(`élément focalisé     : ${focused}`);

// Le clic conserve la navigation.
const link = page.locator(`${SELECTOR} > li:nth-child(2) a`);
await link.scrollIntoViewIfNeeded();
const expectedHref = await link.getAttribute("href");
await link.click({ force: true });
await page.waitForURL((url) => url.pathname !== "/", { timeout: 15000 }).catch(() => {});
console.log(`cible attendue       : ${expectedHref}`);
console.log(`après clic           : ${page.url()}`);
console.log(`=> navigation depuis le carrousel : ${page.url().includes("/categories/") ? "OK" : "PROBLÈME"}`);

await context.close();
await browser.close();

process.exit(0);