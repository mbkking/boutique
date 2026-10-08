import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ storageState: 'scripts/audit-results/admin-auth.json' });
const p = await ctx.newPage();
await p.goto('https://boutique-admin-niger.vercel.app/admin/categories', { waitUntil: 'networkidle', timeout: 60000 });
const li = p.locator('main li', { hasText: 'Categorie Test E2E 1791072288973' }).first();
console.log('buttons:', await li.locator('button').allInnerTexts());
const del = li.locator('button:has-text("Supprimer")');
if (await del.count()) {
  await del.first().click();
  await p.waitForTimeout(800);
  const conf = li.locator('button:has-text("Supprimer")').last();
  await conf.click();
  await p.waitForTimeout(5000);
  const alerts = await p.locator('[role=alert], [role=status]').allInnerTexts();
  console.log('ALERTS:', alerts);
  await p.goto('https://boutique-admin-niger.vercel.app/admin/categories', { waitUntil: 'networkidle' });
  console.log('still listed:', (await p.locator('body').innerText()).includes('Categorie Test E2E 1791072288973'));
} else {
  console.log('no delete button');
}
await b.close();
