import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('https://boutique-client-two.vercel.app/products/bab', { waitUntil: 'networkidle' });
console.log((await p.locator('main').innerText()).slice(0, 1200));
await b.close();
