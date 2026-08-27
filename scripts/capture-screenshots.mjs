/**
 * Captures the README screenshots by driving the real app in Chromium.
 *
 * Both servers must be running and the database seeded:
 *   cd backend  && npm run db:setup && npm run dev
 *   cd frontend && npm run dev
 *   cd scripts  && npm run screenshots
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.SHOT_BASE || 'http://localhost:5173';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'screenshots');

const ACCOUNTS = {
  admin: { email: 'admin@storerate.com', password: 'Admin@1234' },
  owner: { email: 'sanjay.pillai@storerate.com', password: 'Test@1234' },
  user: { email: 'aarav.kulkarni@example.com', password: 'Test@1234' },
};

await fs.mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const captured = [];

async function shot(page, name) {
  await page.waitForLoadState('networkidle');
  // Let the star glyphs and any fade settle before the frame is grabbed.
  await page.waitForTimeout(350);

  // `.app-shell` is min-height 100%, so a short page would otherwise be captured
  // with a tall band of empty background. Clip to where the content actually ends.
  const contentHeight = await page.evaluate(() => {
    const content = document.querySelector('.content');
    if (!content) return 0; // auth pages are centred in the viewport - leave them
    const bottoms = [...content.children].map((el) => el.getBoundingClientRect().bottom);
    if (bottoms.length === 0) return 0;
    return Math.ceil(Math.max(...bottoms) + window.scrollY + 32);
  });

  const file = path.join(OUT_DIR, `${name}.png`);
  const { width } = page.viewportSize();
  await page.screenshot({
    path: file,
    fullPage: true,
    ...(contentHeight > 0 && { clip: { x: 0, y: 0, width, height: contentHeight } }),
  });
  const { size } = await fs.stat(file);
  captured.push(`${name}.png (${Math.round(size / 1024)} KB)`);
  console.log(`  captured ${name}.png`);
}

async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  return context.newPage();
}

async function signIn(page, account) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

try {
  // ---------- public pages ----------
  console.log('\nPublic pages');
  let page = await newPage();

  await page.goto(`${BASE}/login`);
  await shot(page, '01-login');

  await page.goto(`${BASE}/register`);
  await page.getByLabel('Full name').fill('Ananya Rajagopalan Menon');
  await page.getByLabel('Email').fill('ananya.menon@example.com');
  await page.getByLabel('Address').fill('27 Residency Road, Bengaluru 560025');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await shot(page, '02-register-validation');

  // ---------- system administrator ----------
  console.log('\nSystem Administrator');
  page = await newPage();
  await signIn(page, ACCOUNTS.admin);
  await shot(page, '03-admin-dashboard');

  await page.goto(`${BASE}/admin/users`);
  await shot(page, '04-admin-users');

  await page.getByRole('cell', { name: 'Sanjay Venkataraman Pillai' }).click();
  await page.waitForURL(/\/admin\/users\/\d+/);
  await shot(page, '05-admin-owner-detail');

  await page.goto(`${BASE}/admin/stores`);
  await shot(page, '06-admin-stores');

  await page.goto(`${BASE}/admin/stores/new`);
  await page.getByLabel('Store name').fill('Lakeside Artisan Coffee Roasters');
  await page.getByLabel('Store email').fill('hello@lakesideroasters.com');
  await page.getByLabel('Address').fill('19 Lake View Road, Udaipur 313001');
  await shot(page, '07-admin-add-store');

  // ---------- normal user ----------
  console.log('\nNormal User');
  page = await newPage();
  await signIn(page, ACCOUNTS.user);
  await shot(page, '08-user-stores');

  await page.getByLabel('Store name').fill('book');
  await page.waitForTimeout(700); // debounce + fetch
  await shot(page, '09-user-search');

  // ---------- store owner ----------
  console.log('\nStore Owner');
  page = await newPage();
  await signIn(page, ACCOUNTS.owner);
  await shot(page, '10-owner-dashboard');

  await page.goto(`${BASE}/account/password`);
  await shot(page, '11-update-password');

  console.log(`\n${captured.length} screenshots written to docs/screenshots/`);
} finally {
  await browser.close();
}
