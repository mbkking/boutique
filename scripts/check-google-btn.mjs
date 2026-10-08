import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('https://boutique-client-two.vercel.app/inscription', { waitUntil: 'networkidle' });
console.log('Google button:', await p.locator('button:has-text("Continuer avec Google")').count());
await b.close();
