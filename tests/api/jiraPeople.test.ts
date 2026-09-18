import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const currentUser = vi.fn();
vi.mock('@/lib/api/context', () => ({
  requireUser: async () => {
    const user = await currentUser();
    if (!user) return { ok: false, response: new Response('não autenticado', { status: 401 }) };
    return { ok: true, value: user };
  }
}));

import { POST as postRoute, DELETE as deleteRoute } from '@/app/api/jira/people/route';
import { GET as searchRoute } from '@/app/api/jira/people/search/route';
import { GET as getPersonRoute } from '@/app/api/jira/people/[accountId]/route';
import { saveConnection, setModuleEnabled } from '@/lib/vault/connections';
import { setJiraFollowedPeople } from '@/lib/preferences';

let dir: string;
const ME = { id: 'u-1', username: 'joao' };

function req(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-people-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  process.env.DAILY_WEB_SECRET_KEY = Buffer.alloc(32, 'a').toString('base64');
  vi.clearAllMocks();
  currentUser.mockResolvedValue(ME);
  const { getDb } = await import('@/lib/db');
  getDb();
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('POST e DELETE /api/jira/people', () => {
  it('401 sem sessão', async () => {
    currentUser.mockResolvedValue(null);
    expect((await postRoute(req('POST', '/api/jira/people', { accountId: '123:abc' }))).status).toBe(401);
  });

  it('400 com accountId inválido', async () => {
    expect((await postRoute(req('POST', '/api/jira/people', { accountId: 'in|valid' }))).status).toBe(400);
    expect((await deleteRoute(req('DELETE', '/api/jira/people', { accountId: ' ' }))).status).toBe(400);
  });

  it('400 sem conexão', async () => {
    expect((await postRoute(req('POST', '/api/jira/people', { accountId: '123:abc' }))).status).toBe(400);
  });

  it('POST busca e guarda nome real do Jira, DELETE tira', async () => {
    saveConnection(ME.id, 'jira', 'Jira', { cloud: 'acme', email: 'eu@acme', token: 'x' });
    setModuleEnabled(ME.id, 'jira', true);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ accountId: '123:abc', accountType: 'atlassian', active: true, displayName: 'Ana Verdadeira' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await postRoute(req('POST', '/api/jira/people', { accountId: '123:abc' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ people: [{ accountId: '123:abc', displayName: 'Ana Verdadeira' }] });

    const delRes = await deleteRoute(req('DELETE', '/api/jira/people', { accountId: '123:abc' }));
    expect(delRes.status).toBe(200);
    expect(await delRes.json()).toEqual({ people: [] });
  });
  
  it('POST 404 quando Jira diz que usuário não existe', async () => {
    saveConnection(ME.id, 'jira', 'Jira', { cloud: 'acme', email: 'eu@acme', token: 'x' });
    setModuleEnabled(ME.id, 'jira', true);

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    const res = await postRoute(req('POST', '/api/jira/people', { accountId: '123:abc' }));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/jira/people/search', () => {
  it('sem query ou curto retorna vazio sem chamar Jira', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await searchRoute(req('GET', '/api/jira/people/search?q=A'));
    expect(await res.json()).toEqual({ people: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/jira/people/[accountId]', () => {
  it('404 se pessoa não é acompanhada e não chama Jira', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    
    const res = await getPersonRoute(req('GET', '/api/jira/people/123:abc'), { params: Promise.resolve({ accountId: '123:abc' }) });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retorna a view quando logado, conectado e acompanhando', async () => {
    saveConnection(ME.id, 'jira', 'Jira', { cloud: 'acme', email: 'eu@acme', token: 'x' });
    setModuleEnabled(ME.id, 'jira', true);
    setJiraFollowedPeople(ME.id, [{ accountId: '123:abc', displayName: 'Ana' }]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ issues: [] })
    });
    vi.stubGlobal('fetch', fetchMock);
    
    const res = await getPersonRoute(req('GET', '/api/jira/people/123:abc'), { params: Promise.resolve({ accountId: '123:abc' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jira.data).toEqual([]);
    expect(data.delivered.data).toEqual([]);
  });
});
