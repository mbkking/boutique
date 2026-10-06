import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1280,height:900} });
const page = await ctx.newPage();
for (const url of ["http://localhost:3000/categories","http://localhost:3000/products/ceinture-cuir-veritable"]) {
  await page.goto(url, { waitUntil:"load" });
  await page.waitForTimeout(2500);
  const rows = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('article')) {
      const link = a.querySelector('a[href^="/products/"]');
      const name = link?.textContent?.trim().slice(0,32);
      const badge = a.textContent.match(/Rupture de stock|En stock|Stock faible|Précommande/)?.[0] ?? "-";
      out.push(`${String(name).padEnd(32)} ${badge}`);
    }
    const whole = document.body.innerText.match(/Rupture de stock|En stock|Stock faible|Précommande|\d+ disponibles?/g);
    return { cards: out, badges: whole };
  });
  console.log("== " + url);
  console.log((rows.cards.length ? rows.cards.join("\n") : "(aucune carte article)"));
  console.log("badges sur la page : " + JSON.stringify(rows.badges));
}
await b.close(); process.exit(0);
