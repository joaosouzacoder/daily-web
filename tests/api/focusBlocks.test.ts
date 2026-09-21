import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CALENDAR_EVENTS_SCOPE } from '@/lib/integrations/google/oauth';

const currentUser = vi.fn();
vi.mock('@/lib/auth/currentUser', () => ({ getCurrentUser: () => currentUser() }));

import { POST } from '@/app/api/agenda/focus-blocks/route';
import { saveConnection, setModuleEnabled } from '@/lib/vault/connections';
import { dropCache, getCachedState, refreshAll } from '@/lib/refresher';

let dir: string;
let connectionId: string;
let otherConnectionId: string;
const ME = { id: 'u-focus', username: 'joao', passwordHash: 'x', isAdmin: false, createdAt: '' };
const OTHER = { ...ME, id: 'u-other', username: 'maria' };

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/agenda/focus-blocks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function valid(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    connectionId,
    item: { kind: 'jira', ref: 'DEV-1', title: 'Corrigir busca', url: 'https://jira.exemplo/DEV-1' },
    start: new Date(Date.now() + 60 * 60_000).toISOString(),
    minutes: 50,
    ...over,
  };
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-focus-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  process.env.DAILY_WEB_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.GOOGLE_CLIENT_ID = 'client';
  process.env.GOOGLE_CLIENT_SECRET = 'secret';
  currentUser.mockResolvedValue(ME);
  const { getDb } = await import('@/lib/db');
  getDb();
  connectionId = saveConnection(ME.id, 'agenda', 'Trabalho', {
    provider: 'google',
    account: 'joao@exemplo.com',
    refreshToken: 'refresh',
    scope: CALENDAR_EVENTS_SCOPE,
  });
  otherConnectionId = saveConnection(OTHER.id, 'agenda', 'Outra', {
    provider: 'google',
    refreshToken: 'other',
    scope: CALENDAR_EVENTS_SCOPE,
  });
  setModuleEnabled(ME.id, 'agenda', true);
});

afterEach(() => {
  dropCache(ME.id);
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/agenda/focus-blocks', () => {
  it('exige sessão', async () => {
    currentUser.mockResolvedValue(null);
    expect((await POST(request(valid()))).status).toBe(401);
  });

  it('não revela uma conexão de outra pessoa', async () => {
    expect((await POST(request(valid({ connectionId: otherConnectionId })))).status).toBe(404);
  });

  it('pede reconexão quando falta o escopo de eventos', async () => {
    const oldId = saveConnection(ME.id, 'agenda', 'Antiga', {
      provider: 'google', refreshToken: 'refresh', account: 'joao@exemplo.com',
    });
    const response = await POST(request(valid({ connectionId: oldId })));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reconnect: true });
  });

  it.each([
    ['tipo', { item: { kind: 'email', ref: '1', title: 'X' } }],
    ['título vazio', { item: { kind: 'task', ref: '1', title: ' ' } }],
    ['título longo', { item: { kind: 'task', ref: '1', title: 'x'.repeat(201) } }],
    ['URL sem HTTPS', { item: { kind: 'jira', ref: 'DEV-1', title: 'X', url: 'http://jira/DEV-1' } }],
    ['início passado', { start: new Date(Date.now() - 10 * 60_000).toISOString() }],
    ['duração', { minutes: 30 }],
  ])('recusa %s inválido', async (_field, over) => {
    expect((await POST(request(valid(over)))).status).toBe(400);
  });

  it('cria no Google e acrescenta o item ao cache da própria pessoa', async () => {
    const start = new Date(Date.now() + 60 * 60_000);
    const created = {
      summary: '🔒 DEV-1 — Corrigir busca',
      start: { dateTime: start.toISOString() },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'read-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'write-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await refreshAll(ME.id);

    const response = await POST(request(valid({ start: start.toISOString() })));

    expect(response.status).toBe(201);
    expect(fetchMock.mock.calls[3]?.[0]).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: 'POST' });
    expect(getCachedState(ME.id)?.agenda.data).toEqual([
      expect.objectContaining({ title: '🔒 DEV-1 — Corrigir busca', account: connectionId }),
    ]);
  });
});
