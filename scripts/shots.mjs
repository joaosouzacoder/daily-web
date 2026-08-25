// Captura o dashboard real (autenticado) nas três larguras de referência.
// Uso: SHOT_PASS=... node scripts/shots.mjs <rótulo> [--open-email]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8010';
const USER = process.env.SHOT_USER ?? 'joao';
const PASS = process.env.SHOT_PASS ?? '';
const label = process.argv[2] ?? 'atual';
const openEmail = process.argv.includes('--open-email');
const outDir = `/tmp/daily-web-shots/${label}`;

const SIZES = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 834, height: 1100 },
  { name: 'mobile', width: 390, height: 900 },
];

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

const auth = await browser.newContext();
const page0 = await auth.newPage();
await page0.goto(`${BASE}/login`);
await page0.fill('input[autocomplete="username"]', USER);
await page0.fill('input[type="password"]', PASS);
await page0.screenshot({ path: `${outDir}/login.png` });
await Promise.all([page0.waitForURL(`${BASE}/`), page0.click('button[type="submit"]')]);
const storageState = await auth.storageState();
await auth.close();

for (const size of SIZES) {
  const ctx = await browser.newContext({
    storageState,
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  if (openEmail && size.name === 'desktop') {
    const first = page.locator('.mail-item .row-main').first();
    if (await first.count()) {
      await first.click();
      await page.waitForTimeout(1200);
    }
  }

  await page.screenshot({ path: `${outDir}/${size.name}.png` });
  await ctx.close();
  console.log(`ok ${size.name}`);
}

await browser.close();
console.log(`shots em ${outDir}`);
