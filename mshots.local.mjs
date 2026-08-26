import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire('/home/jgabr/projects/daily-web/package.json');
const Database = require('better-sqlite3');

const R = '/home/jgabr/projects/daily-web';
const label = process.argv[2] ?? 'antes';
const out = `/tmp/daily-web-shots/${label}`;
mkdirSync(out, { recursive: true });

const secret = readFileSync('/etc/daily-web/env', 'utf8').match(/^SESSION_SECRET=(.*)$/m)[1];
const db = new Database(`${R}/data/daily-web.db`);
const u = db.prepare('SELECT id, username FROM users ORDER BY created_at LIMIT 1').get();
const p = Buffer.from(JSON.stringify({ userId: u.id, user: u.username, issuedAt: Date.now() })).toString('base64url');
const token = `${p}.${createHmac('sha256', secret).update(p).digest('base64url')}`;

const notif = (i) => ({
  id: `PROJ-${100 + i}`,
  source: 'jira_mention',
  title: `PROJ-${100 + i} — Ajustar o fluxo de conciliação financeira quando o provedor devolve status parcial`,
  url: 'https://example.atlassian.net/browse/PROJ-1',
  read: false,
});
const pull = (i) => ({
  repo: 'joaosouzacoder/daily-web', number: 40 + i,
  title: `Corrigir o parser de envelopes quando o assunto vem sem codificação MIME (${i})`,
  url: 'https://github.com/x/y/pull/1', author: 'dependabot', mine: false,
  draft: i % 2 === 0, awaitingYou: i % 3 === 0,
});

const STATE = {
  updatedAt: new Date().toISOString(),
  modules: ['email', 'agenda', 'jira', 'pulls', 'tasks'],
  mailboxes: [],
  email: { data: [], error: null },
  agenda: { data: [], error: null },
  pulls: { data: { items: [0,1,2,3].map(pull), errors: [] }, error: null },
  jira: { data: [], error: null },
  tasks: { data: [], error: null },
  notifications: { data: [0,1,2,3,4].map(notif), error: null },
  pomodoro: { enabled: true, phase: 'focus', running: false, remainingSeconds: 1500,
    focusMinutes: 25, restMinutes: 5, completedFocusCount: 0 },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: 'daily_web_session', value: token, domain: '127.0.0.1', path: '/' }]);
const page = await ctx.newPage();
await page.route('**/api/state', (r) => r.fulfill({ json: STATE }));
await page.route('**/api/pulls/repos', (r) => r.fulfill({ json: { repos: ['joaosouzacoder/daily-web', 'joaosouzacoder/daily-tui', 'algum-org/repositorio-com-nome-bem-longo'] } }));
await page.goto('http://127.0.0.1:8010/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

await page.screenshot({ path: `${out}/mobile-topo.png` });

// Sino aberto
const bell = page.locator('.bell button').first();
if (await bell.count()) {
  await bell.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/mobile-notificacoes.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// Menu de repositórios do ghpending
const summary = page.locator('.pulls-repos summary').first();
if (await summary.count()) {
  await summary.scrollIntoViewIfNeeded();
  await summary.click();
  await page.waitForTimeout(500);
  await page.locator('.pulls-repos').screenshot({ path: `${out}/mobile-ghpending.png` });
  await page.screenshot({ path: `${out}/mobile-ghpending-full.png` });
}

await browser.close();
console.log('shots em', out);
