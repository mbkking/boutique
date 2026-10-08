import { chromium } from 'playwright';
// Le bouton Google a été retiré de l'inscription (récitéré plus tard).
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('https://boutique-client-two.vercel.app/inscription', { waitUntil: 'networkidle' });
const count = await p.locator('button:has-text("Continuer avec Google")').count();
console.log('Google button count (attendu 0) :', count);
await b.close();
if (count !== 0) process.exit(1);