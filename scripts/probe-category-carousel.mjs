/**
 * Vérification navigateur du carrousel de catégories.
 *
 * Contrôle le comportement réel sur plusieurs largeurs : une seule rangée
 * horizontale sur mobile, accrochage, scrollbars masquées, absence de
 * débordement de page, et grille inchangée sur desktop. L'autoplay a été
 * retiré : aucun défilement automatique n'est attendu.
 *
 * Usage : node scripts/probe-category-carousel.mjs
 */

import { chromium } from "playwright";

const URL = "http://localhost:3000";

const VIEWPORTS = [
  { name: "mobile étroit", width: 320, height: 640, mobile: true },
  { name: "mobile standard", width: 390, height: 844, mobile: true },
  { name: "tablette", width: 768, height: 1024, mobile: true },
  { name: "desktop", width: 1440, height: 900, mobile: false },
];

const browser = await chromium.launch();

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    deviceScaleFactor: viewport.mobile ? 3 : 1,
  });
  const page = await context.newPage();

  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 140));
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message.slice(0, 140)}`));

  await page.goto(URL, { waitUntil: "load" });
  await page.waitForSelector('[aria-label^="Catégories, faites défiler"]', { timeout: 20000 });
  await page.waitForTimeout(1200);

  const report = await page.evaluate(() => {
    const track = document.querySelector('[aria-label^="Catégories, faites défiler"]');
    const cards = [...track.querySelectorAll(":scope > li")];
    const first = cards[0];
    const style = window.getComputedStyle(track);
    const firstStyle = first ? window.getComputedStyle(first) : null;
    const trackRect = track.getBoundingClientRect();
    const cardRects = cards.map((card) => card.getBoundingClientRect());

    // Nombre de rangées : on regroupe les cartes par verticale.
    const tops = [...new Set(cardRects.map((rect) => Math.round(rect.top)))].length;

    return {
      cards: cards.length,
      display: style.display,
      overflowX: style.overflowX,
      snapType: style.scrollSnapType,
      snapAlign: firstStyle?.scrollSnapAlign ?? "",
      cardWidthPct: first
        ? Math.round((firstRect(cardRects[0]) * 100) / Math.round(trackRect.width))
        : 0,
      rows: tops,
      scrollWidth: track.scrollWidth,
      clientWidth: track.clientWidth,
      scrollable: track.scrollWidth > track.clientWidth + 2,
      scrollbarVisible: style.scrollbarWidth !== "none" && style.getPropertyValue("scrollbar-width") !== "none",
      // Débordement horizontal de toute la page
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      linkCount: track.querySelectorAll('a[href^="/categories/"]').length,
      heights: cardRects.map((rect) => Math.round(rect.height)),
      firstTop: cardRects[0] ? Math.round(cardRects[0].top) : 0,
      lastTop: cardRects.at(-1) ? Math.round(cardRects.at(-1).top) : 0,
    };

    function firstRect(rect) {
      return rect.width;
    }
  });

  const isDesktop = viewport.width >= 640;
  const isGrid = report.display === "grid";
  const isRow = report.rows === 1;

  console.log(`\n===== ${viewport.name} (${viewport.width}px)`);
  console.log(`  cartes            : ${report.cards} (liens : ${report.linkCount})`);
  console.log(`  display           : ${report.display}`);
  console.log(`  rangées           : ${report.rows} ${isRow ? "(UNE SEULE LIGNE)" : ""}`);
  console.log(`  overflow-x        : ${report.overflowX}`);
  console.log(`  scroll-snap-type  : ${report.snapType}`);
  console.log(`  snap-align carte  : ${report.snapAlign}`);
  console.log(`  largeur carte     : ~${report.cardWidthPct}% du conteneur`);
  console.log(`  scrollable        : ${report.scrollable} (${report.scrollWidth} > ${report.clientWidth})`);
  console.log(`  scrollbar masquée : ${!report.scrollbarVisible}`);
  console.log(`  débordement page  : ${report.pageOverflow}px ${report.pageOverflow <= 0 ? "(aucun)" : "(PROBLÈME)"}`);
  console.log(`  hauteur cartes    : ${[...new Set(report.heights)].join(", ")}px`);
  console.log(`  attendu           : ${isDesktop ? "GRILLE" : "CARROUSEL"}`);
  console.log(`  => ${isDesktop ? (isGrid ? "OK grille conservée" : "PROBLÈME") : isRow && report.snapType.includes("x") ? "OK carrousel" : "PROBLÈME"}`);
  if (errors.length > 0) console.log(`  erreurs           : ${errors.slice(0, 3).join(" | ")}`);

  if (!isDesktop) {
    // L'autoplay est retiré : la position ne doit pas bouger seule.
    const before = await page.evaluate(
      () => document.querySelector('[aria-label^="Catégories"]').scrollLeft
    );
    await page.waitForTimeout(4200);
    const after = await page.evaluate(
      () => document.querySelector('[aria-label^="Catégories"]').scrollLeft
    );
    const moved = Math.abs(after - before);
    console.log(`  autoplay scrollLeft : ${Math.round(before)} -> ${Math.round(after)} (déplacement ${Math.round(moved)}px ${moved <= 5 ? "OK, aucun autoplay" : "PROBLÈME"})`);

    // Le défilement manuel reste opérationnel.
    if (report.cards > 1) {
      const scrolled = await page.evaluate(async () => {
        const track = document.querySelector('[aria-label^="Catégories"]');
        track.scrollLeft = 240;
        track.dispatchEvent(new Event("scroll", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 120));
        return Math.round(track.scrollLeft);
      });
      console.log(`  après défilement manuel : scrollLeft = ${scrolled} ${scrolled > 20 ? "(OK, scrollable)" : "(PROBLÈME)"}`);
    }
  }

  await context.close();
}

await browser.close();

process.exit(0);