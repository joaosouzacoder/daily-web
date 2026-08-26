import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

let cookieValue: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }),
}));

let dir: string;
const ORIGINAL_ENV = { ...process.env };
const SECRET = 'segredo-de-teste';

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-cred-api-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  process.env.SESSION_SECRET = SECRET;
  process.env.DAILY_WEB_SECRET_KEY = randomBytes(32).toString('base64');
  cookieValue = undefined;
  vi.resetModules();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  process.env = { ...ORIGINAL_ENV };
});

async function load() {
  const users = await import('@/lib/auth/users');
  const { createSessionToken } = await import('@/lib/auth/session');
  const list = await import('@/app/api/credentials/route');
  const one = await import('@/app/api/credentials/[provider]/route');
  const vault = await import('@/lib/vault/credentials');
  return { ...users, ...vault, createSessionToken, GET: list.GET, PUT: one.PUT, DELETE: one.DELETE };
}

const params = (provider: string) => ({ params: Promise.resolve({ provider }) });
const req = (body: unknown) =>
  new Request('http://localhost/api/credentials/jira', { method: 'PUT', body: JSON.stringify(body) });

async function login(mod: Awaited<ReturnType<typeof load>>, admin = true) {
  const user = await mod.createUser(admin ? 'joao' : 'maria', 'x1234567', admin);
  cookieValue = await mod.createSessionToken(user.id, user.username, SECRET);
  return user;
}

describe('GET /api/credentials', () => {
  it('sem sessão devolve 401', async () => {
    const mod = await load();
    expect((await mod.GET()).status).toBe(401);
  });

  it('lista o estado de todos os provedores', async () => {
    const mod = await load();
    await login(mod);
    const data = await (await mod.GET()).json();
    expect(data.credentials.map((c: { provider: string }) => c.provider)).toEqual(['jira', 'github', 'mstodo']);
    expect(data.vaultReady).toBe(true);
  });

  it('avisa quando o cofre não tem chave configurada', async () => {
    delete process.env.DAILY_WEB_SECRET_KEY;
    vi.resetModules();
    const mod = await load();
    await login(mod);
    expect((await (await mod.GET()).json()).vaultReady).toBe(false);
  });
});

describe('PUT /api/credentials/[provider]', () => {
  it('grava e devolve o estado sem o segredo', async () => {
    const mod = await load();
    const user = await login(mod);

    const res = await mod.PUT(
      req({ values: { cloud: 'acme', email: 'a@b.c', token: 'segredo-do-jira' } }) as never,
      params('jira'),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(JSON.stringify(data)).not.toContain('segredo-do-jira');
    expect(data.credential.visible).toEqual({ cloud: 'acme', email: 'a@b.c' });
    expect(mod.getCredential(user.id, 'jira')?.token).toBe('segredo-do-jira');
  });

  // Sem essa filtragem o cliente gravaria chaves arbitrárias, que viram
  // variáveis de ambiente de um processo CLI mais adiante.
  it('ignora campos que não pertencem ao provedor', async () => {
    const mod = await load();
    const user = await login(mod);
    await mod.PUT(req({ values: { token: 'ok', PATH: '/tmp/malicioso' } }) as never, params('github'));
    expect(mod.getCredential(user.id, 'github')).toEqual({ token: 'ok' });
  });

  it('provedor desconhecido devolve 400', async () => {
    const mod = await load();
    await login(mod);
    expect((await mod.PUT(req({ values: { token: 'x' } }) as never, params('dropbox'))).status).toBe(400);
  });

  it('corpo sem campos preenchidos devolve 400', async () => {
    const mod = await load();
    await login(mod);
    expect((await mod.PUT(req({ values: { token: '' } }) as never, params('github'))).status).toBe(400);
  });

  it('sem sessão não grava', async () => {
    const mod = await load();
    expect((await mod.PUT(req({ values: { token: 'x' } }) as never, params('github'))).status).toBe(401);
  });

  // Duas pessoas configurando o mesmo provedor não podem se sobrepor.
  it('não mistura a credencial de dois usuários', async () => {
    const mod = await load();
    const joao = await login(mod);
    await mod.PUT(req({ values: { token: 'do-joao' } }) as never, params('github'));

    const maria = await mod.createUser('maria', 'y1234567');
    cookieValue = await mod.createSessionToken(maria.id, maria.username, SECRET);
    await mod.PUT(req({ values: { token: 'da-maria' } }) as never, params('github'));

    expect(mod.getCredential(joao.id, 'github')?.token).toBe('do-joao');
    expect(mod.getCredential(maria.id, 'github')?.token).toBe('da-maria');
  });
});

describe('DELETE /api/credentials/[provider]', () => {
  it('remove a credencial', async () => {
    const mod = await load();
    const user = await login(mod);
    await mod.PUT(req({ values: { token: 'x' } }) as never, params('github'));
    expect((await mod.DELETE({} as never, params('github'))).status).toBe(200);
    expect(mod.getCredential(user.id, 'github')).toBeNull();
  });

  it('remover o que não existe devolve 404', async () => {
    const mod = await load();
    await login(mod);
    expect((await mod.DELETE({} as never, params('github'))).status).toBe(404);
  });
});
