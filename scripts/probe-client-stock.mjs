import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1280,height:900} });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/", { waitUntil:"load" });
await page.waitForTimeout(2500);
const cards = await page.evaluate(() => {
  return [...document.querySelectorAll('article')].slice(0,20).map(a => {
    const name = a.querySelector('a[href^="/products/"]')?.textContent?.trim().slice(0,30);
    const href = a.querySelector('a[href^="/products/"]')?.getAttribute('href');
    const badge = a.textContent.match(/Rupture de stock|En stock|Stock faible|Précommande/)?.[0] ?? "(aucun badge)";
    return `${name} | ${badge} | ${href}`;
  });
});
console.log(cards.join("\n"));
await b.close(); process.exit(0);
