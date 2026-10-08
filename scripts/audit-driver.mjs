import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto('https://livreur-nu.vercel.app/connexion', { waitUntil: 'networkidle' });
await p.locator('input[type=email]').first().fill('bassirouyahayamoubarak20@gmail.com');
await p.locator('input[type=password]').first().fill('NstMqDHspRVBjX!7');
await p.locator('button[type=submit]').first().click();
await p.waitForTimeout(6000);
console.log('URL after login:', p.url());
for (const u of ['/driver', '/driver/deliveries', '/driver/history', '/livreur', '/livreur/livraisons', '/livreur/historique', '/livreur/profil']) {
  const r = await p.goto('https://livreur-nu.vercel.app' + u, { waitUntil: 'networkidle' }).catch(() => null);
  const txt = (await p.locator('main').innerText().catch(() => '')).slice(0, 200).replace(/\n/g, ' | ');
  console.log('\n###', u, r ? r.status() : 'FAIL', txt);
}
await b.close();
