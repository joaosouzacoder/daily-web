import { chromium } from 'playwright';
const S = '/tmp/claude-1000/-home-jgabr-projects-daily-web/f4e7b8de-1daf-446c-91ca-aa35c112f3ae/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
await p.goto('https://dashboard.joaosouzacoder.com.br/login');
await p.getByLabel('Usuário').fill('joao');
await p.fill('input[type="password"]', '37f85dee138912335ba785b0adf87e05');
await p.click('button[type="submit"]');
await p.waitForURL('**/', { timeout: 30000 });
await p.waitForTimeout(12000);

const inbox = p.locator('section').filter({ hasText: 'INBOX' }).first();
const linhas = inbox.locator('li.mail-item');
console.log('conversas na lista:', await linhas.count());
console.log('--- primeiras linhas ---');
for (let i = 0; i < Math.min(6, await linhas.count()); i += 1) {
  console.log(' •', (await linhas.nth(i).locator('.row').first().innerText()).replace(/\n/g, ' | '));
}
await inbox.screenshot({ path: `${S}/threads-lista.png` });

// Abrir a conversa com mais de uma mensagem
const comContagem = inbox.locator('li.mail-item').filter({ has: p.locator('.row-count') });
console.log('conversas com mais de uma mensagem:', await comContagem.count());
if (await comContagem.count()) {
  const alvo = comContagem.first();
  await alvo.locator('.row-main').click();
  await p.waitForTimeout(1500);
  console.log('--- conversa aberta ---');
  console.log(await alvo.innerText());
  await alvo.screenshot({ path: `${S}/threads-aberta.png` });

  // abrir a última mensagem do fio
  const msgs = alvo.locator('.thread-row');
  await msgs.last().click();
  await p.waitForTimeout(4000);
  const corpo = alvo.locator('[aria-label="corpo do e-mail"]');
  console.log('--- corpo ---');
  console.log((await corpo.innerText()).slice(0, 300));
  console.log('botao de historico:', await alvo.getByLabel(/mostrar histórico/).count());
  await alvo.screenshot({ path: `${S}/threads-corpo.png` });

  if (await alvo.getByLabel(/mostrar histórico/).count()) {
    await alvo.getByLabel(/mostrar histórico/).click();
    await p.waitForTimeout(800);
    console.log('--- historico aberto ---');
    console.log((await alvo.locator('.mail-quoted').innerText()).slice(0, 300));
    await alvo.screenshot({ path: `${S}/threads-historico.png` });
  }
}
await b.close();
