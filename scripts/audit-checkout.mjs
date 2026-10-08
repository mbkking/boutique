import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto('https://boutique-client-two.vercel.app/products/bab', { waitUntil: 'networkidle' });
await p.locator('button:has-text("Ajouter au panier")').click();
await p.waitForTimeout(2000);
await p.goto('https://boutique-client-two.vercel.app/checkout', { waitUntil: 'networkidle' });
// step 1: coordonnées
await p.locator('input').first().fill('QA Testeur');
const inputs = await p.locator('input').all();
console.log('inputs on step1:', await Promise.all(inputs.map(async i => await i.getAttribute('name') + ':' + await i.getAttribute('type'))));
await b.close();
