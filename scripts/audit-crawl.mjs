import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'scripts/audit-results';
fs.mkdirSync(OUT, { recursive: true });

const ADMIN = { email: 'admin.test@exemple.ne', password: 'Adm25-7f3c9a1e4b' };
const DRIVER = { email: 'bassirouyahayamoubarak20@gmail.com', password: 'NstMqDHspRVBjX!7' };

const report = { client: {}, admin: {}, driver: {} };

async function visit(page, url, label, log) {
  const entry = { url, label, consoleErrors: [], failedRequests: [], badStatuses: [] };
  const onConsole = (m) => { if (m.type() === 'error') entry.consoleErrors.push(m.text().slice(0, 300)); };
  const onReqFailed = (r) => entry.failedRequests.push(r.url().slice(0, 200) + ' :: ' + (r.failure()?.errorText || ''));
  const onResp = (r) => { if (r.status() >= 400) entry.badStatuses.push(r.status() + ' ' + r.url().slice(0, 160)); };
  page.on('console', onConsole);
  page.on('requestfailed', onReqFailed);
  page.on('response', onResp);
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
    entry.finalUrl = page.url();
    entry.status = resp ? resp.status() : 'NAV-FAIL';
    entry.title = await page.title().catch(() => '');
    await page.waitForTimeout(1500);
    entry.screenshot = `${label}.png`;
    await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false }).catch(() => {});
  } catch (e) {
    entry.error = String(e).slice(0, 300);
  }
  page.off('console', onConsole);
  page.off('requestfailed', onReqFailed);
  page.off('response', onResp);
  log.push(entry);
  console.log(`[${label}] ${entry.status} ${entry.finalUrl || url} errs=${entry.consoleErrors.length} reqFail=${entry.failedRequests.length} bad=${entry.badStatuses.length}`);
  return entry;
}

const browser = await chromium.launch({ headless: true });

// ===== CLIENT =====
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  const log = [];
  await visit(page, 'https://boutique-client-two.vercel.app/', 'client-home', log);
  await visit(page, 'https://boutique-client-two.vercel.app/products', 'client-products', log);
  await visit(page, 'https://boutique-client-two.vercel.app/categories', 'client-categories', log);
  await visit(page, 'https://boutique-client-two.vercel.app/search', 'client-search', log);
  await visit(page, 'https://boutique-client-two.vercel.app/cart', 'client-cart', log);
  await visit(page, 'https://boutique-client-two.vercel.app/checkout', 'client-checkout', log);
  await visit(page, 'https://boutique-client-two.vercel.app/connexion', 'client-login', log);
  await visit(page, 'https://boutique-client-two.vercel.app/inscription', 'client-register', log);
  await visit(page, 'https://boutique-client-two.vercel.app/orders', 'client-orders', log);
  await visit(page, 'https://boutique-client-two.vercel.app/about', 'client-about', log);
  await visit(page, 'https://boutique-client-two.vercel.app/contact', 'client-contact', log);
  report.client.pages = log;
  await ctx.close();
}

// ===== ADMIN =====
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  const log = [];
  await visit(page, 'https://boutique-admin-niger.vercel.app/admin', 'admin-home-noauth', log);
  // try login
  let loginOk = false;
  try {
    await page.goto('https://boutique-admin-niger.vercel.app/connexion', { waitUntil: 'networkidle', timeout: 45000 });
    await page.screenshot({ path: `${OUT}/admin-login-page.png` });
    const inputs = await page.locator('input').all();
    console.log('admin login inputs:', inputs.length);
    await page.locator('input[type=email], input[name*=email i]').first().fill(ADMIN.email);
    await page.locator('input[type=password]').first().fill(ADMIN.password);
    await page.screenshot({ path: `${OUT}/admin-login-filled.png` });
    await page.locator('button[type=submit]').first().click();
    await page.waitForTimeout(5000);
    console.log('after admin login url:', page.url());
    await page.screenshot({ path: `${OUT}/admin-after-login.png` });
    loginOk = !page.url().includes('connexion');
  } catch (e) { console.log('admin login error', String(e).slice(0, 200)); }
  report.admin.loginOk = loginOk;
  if (loginOk) {
    await visit(page, 'https://boutique-admin-niger.vercel.app/admin', 'admin-dashboard', log);
    // discover admin subpages by clicking sidebar links
    const links = await page.locator('a[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href')).filter(Boolean));
    report.admin.links = [...new Set(links)];
    console.log('admin links:', report.admin.links.join(', '));
    const uniq = [...new Set(links)].filter((h) => h.startsWith('/') || h.includes('admin'));
    for (const h of uniq.slice(0, 25)) {
      const url = h.startsWith('http') ? h : 'https://boutique-admin-niger.vercel.app' + h;
      await visit(page, url, 'admin-' + h.replace(/[^a-z0-9]/gi, '-').slice(0, 40), log);
    }
  }
  report.admin.pages = log;
  await ctx.close();
}

// ===== DRIVER =====
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  const log = [];
  await visit(page, 'https://livreur-nu.vercel.app/driver', 'driver-home-noauth', log);
  let loginOk = false;
  try {
    await page.goto('https://livreur-nu.vercel.app/connexion', { waitUntil: 'networkidle', timeout: 45000 });
    await page.screenshot({ path: `${OUT}/driver-login-page.png` });
    await page.locator('input[type=email], input[name*=email i]').first().fill(DRIVER.email);
    await page.locator('input[type=password]').first().fill(DRIVER.password);
    await page.locator('button[type=submit]').first().click();
    await page.waitForTimeout(5000);
    console.log('after driver login url:', page.url());
    await page.screenshot({ path: `${OUT}/driver-after-login.png` });
    loginOk = !page.url().includes('connexion');
  } catch (e) { console.log('driver login error', String(e).slice(0, 200)); }
  report.driver.loginOk = loginOk;
  if (loginOk) {
    await visit(page, 'https://livreur-nu.vercel.app/driver', 'driver-dashboard', log);
    const links = await page.locator('a[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href')).filter(Boolean));
    report.driver.links = [...new Set(links)];
    console.log('driver links:', report.driver.links.join(', '));
    for (const h of report.driver.links.slice(0, 20)) {
      const url = h.startsWith('http') ? h : 'https://livreur-nu.vercel.app' + h;
      if (!url.includes('connexion') && !url.includes('mot-de-passe') && !url.includes('reinitialiser') && !url.includes('logout'))
        await visit(page, url, 'driver-' + h.replace(/[^a-z0-9]/gi, '-').slice(0, 40), log);
    }
  }
  report.driver.pages = log;
  await ctx.close();
}

fs.writeFileSync(`${OUT}/crawl-report.json`, JSON.stringify(report, null, 2));
await browser.close();
console.log('DONE');
