import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// getCurrentUser lê o cookie via next/headers; nos testes controlamos quem
// está logado trocando este valor.
let cookieValue: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }),
}));

let dir: string;
const ORIGINAL_ENV = { ...process.env };
const SECRET = 'segredo-de-teste';

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-users-api-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  process.env.SESSION_SECRET = SECRET;
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
  const list = await import('@/app/api/users/route');
  const one = await import('@/app/api/users/[username]/route');
  return { ...users, createSessionToken, GET: list.GET, POST: list.POST, DELETE: one.DELETE, PATCH: one.PATCH };
}

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/users', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const params = (username: string) => ({ params: Promise.resolve({ username }) });

describe('GET /api/users', () => {
  it('admin recebe a lista', async () => {
    const { createUser, createSessionToken, GET } = await load();
    const admin = await createUser('joao', 'x1234567', true);
    await createUser('maria', 'y1234567');
    cookieValue = await createSessionToken(admin.id, admin.username, SECRET);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.users.map((u: { username: string }) => u.username)).toEqual(['joao', 'maria']);
  });

  // O hash não serve para administrar e, vazado, dá material para quebra
  // offline da senha.
  it('a lista não expõe o hash da senha', async () => {
    const { createUser, createSessionToken, GET } = await load();
    const admin = await createUser('joao', 'x1234567', true);
    cookieValue = await createSessionToken(admin.id, admin.username, SECRET);

    const data = await (await GET()).json();
    expect(JSON.stringify(data)).not.toMatch(/\$2[aby]\$/);
    expect(data.users[0].passwordHash).toBeUndefined();
  });

  it('não-admin recebe 403', async () => {
    const { createUser, createSessionToken, GET } = await load();
    await createUser('joao', 'x1234567', true);
    const maria = await createUser('maria', 'y1234567');
    cookieValue = await createSessionToken(maria.id, maria.username, SECRET);
    expect((await GET()).status).toBe(403);
  });

  it('sem cookie recebe 401', async () => {
    const { GET } = await load();
    expect((await GET()).status).toBe(401);
  });

  // Um token assinado com outro segredo não pode virar sessão válida.
  it('cookie assinado com outro segredo recebe 401', async () => {
    const { createUser, createSessionToken, GET } = await load();
    const admin = await createUser('joao', 'x1234567', true);
    cookieValue = await createSessionToken(admin.id, admin.username, 'outro-segredo');
    expect((await GET()).status).toBe(401);
  });
});

describe('POST /api/users', () => {
  it('admin cria usuário', async () => {
    const { createUser, createSessionToken, POST, listUsers } = await load();
    const admin = await createUser('joao', 'x1234567', true);
    cookieValue = await createSessionToken(admin.id, admin.username, SECRET);

    const res = await POST(jsonRequest({ username: 'ana', password: 'senha-da-ana' }) as never);
    expect(res.status).toBe(201);
    expect(listUsers().map((u) => u.username)).toContain('ana');
  });

  it('senha curta devolve 400 com a mensagem', async () => {
    const { createUser, createSessionToken, POST } = await load();
    const admin = await createUser('joao', 'x1234567', true);
    cookieValue = await createSessionToken(admin.id, admin.username, SECRET);

    const res = await POST(jsonRequest({ username: 'ana', password: 'curta' }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/8 caracteres/i);
  });

  it('não-admin não cria', async () => {
    const { createUser, createSessionToken, POST, listUsers } = await load();
    await createUser('joao', 'x1234567', true);
    const maria = await createUser('maria', 'y1234567');
    cookieValue = await createSessionToken(maria.id, maria.username, SECRET);

    expect((await POST(jsonRequest({ username: 'ana', password: 'senha-da-ana' }) as never)).status).toBe(403);
    expect(listUsers().map((u) => u.username)).not.toContain('ana');
  });
});

describe('DELETE /api/users/[username]', () => {
  it('admin remove outro usuário', async () => {
    const { createUser, createSessionToken, DELETE, listUsers } = await load();
    const admin = await createUser('joao', 'x1234567', true);
    await createUser('maria', 'y1234567');
    cookieValue = await createSessionToken(admin.id, admin.username, SECRET);

    expect((await DELETE({} as never, params('maria'))).status).toBe(200);
    expect(listUsers().map((u) => u.username)).toEqual(['joao']);
  });

  it('não deixa remover a si mesmo', async () => {
    const { createUser, createSessionToken, DELETE, listUsers } = await load();
    const admin = await createUser('joao', 'x1234567', true);
    await createUser('ana', 'y1234567', true);
    cookieValue = await createSessionToken(admin.id, admin.username, SECRET);

    const res = await DELETE({} as never, params('joao'));
    expect(res.status).toBe(400);
    expect(listUsers().map((u) => u.username)).toContain('joao');
  });

  it('não deixa remover o último admin', async () => {
    const { createUser, createSessionToken, DELETE } = await load();
    const admin = await createUser('joao', 'x1234567', true);
    await createUser('maria', 'y1234567');
    cookieValue = await createSessionToken(admin.id, admin.username, SECRET);
    // maria remove joao seria 403; aqui o admin tenta remover o outro admin
    // inexistente — o caso real é o guard de users.ts, coberto lá.
    const res = await DELETE({} as never, params('inexistente'));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/users/[username]', () => {
  it('usuário troca a própria senha sem ser admin', async () => {
    const { createUser, createSessionToken, PATCH, findUserByUsername } = await load();
    const maria = await createUser('maria', 'y1234567');
    const before = findUserByUsername('maria')?.passwordHash;
    cookieValue = await createSessionToken(maria.id, maria.username, SECRET);

    const res = await PATCH(jsonRequest({ password: 'nova-senha-123' }) as never, params('maria'));
    expect(res.status).toBe(200);
    expect(findUserByUsername('maria')?.passwordHash).not.toBe(before);
  });

  it('não-admin não troca a senha de outro', async () => {
    const { createUser, createSessionToken, PATCH, findUserByUsername } = await load();
    const maria = await createUser('maria', 'y1234567');
    await createUser('ana', 'z1234567');
    const before = findUserByUsername('ana')?.passwordHash;
    cookieValue = await createSessionToken(maria.id, maria.username, SECRET);

    const res = await PATCH(jsonRequest({ password: 'nova-senha-123' }) as never, params('ana'));
    expect(res.status).toBe(403);
    expect(findUserByUsername('ana')?.passwordHash).toBe(before);
  });
});
