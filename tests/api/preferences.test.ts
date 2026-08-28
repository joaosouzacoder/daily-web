import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const currentUser = vi.fn();
vi.mock('@/lib/auth/currentUser', () => ({ getCurrentUser: () => currentUser() }));

import { PATCH as route } from '@/app/api/preferences/route';

let dir: string;
const ME = { id: 'u-1', username: 'joao', passwordHash: 'x', isAdmin: true, createdAt: '' };

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/preferences', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-prefs-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  vi.clearAllMocks();
  currentUser.mockResolvedValue(ME);
  const { getDb } = await import('@/lib/db');
  getDb();
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('sessão', () => {
  it('exige usuário logado', async () => {
    currentUser.mockResolvedValue(null);
    expect((await route(req({ layout: null }))).status).toBe(401);
  });

  it('recusa corpo que não é objeto', async () => {
    expect((await route(req('nada')))?.status).toBe(400);
  });
});


describe('disposição por tamanho de tela', () => {
  const disp = [{ i: 'email', x: 5, y: 0, w: 7, h: 14 }];

  it('grava junto com o tamanho da janela', async () => {
    const res = await route(req({ layout: disp, viewport: { width: 1920, height: 1080 } }));
    expect(res.status).toBe(200);

    const { layouts } = await res.json();
    expect(layouts).toHaveLength(1);
    expect(layouts[0]).toMatchObject({ width: 1920, height: 1080 });
    expect(layouts[0].layout.find((p: { i: string }) => p.i === 'email').x).toBe(5);
  });

  it('guarda um tamanho por tela e substitui ao repetir', async () => {
    await route(req({ layout: disp, viewport: { width: 1920, height: 1080 } }));
    await route(req({ layout: disp, viewport: { width: 1512, height: 945 } }));
    const res = await route(
      req({
        layout: [{ i: 'email', x: 0, y: 0, w: 6, h: 14 }],
        viewport: { width: 1920, height: 1080 },
      }),
    );

    const { layouts } = await res.json();
    expect(layouts).toHaveLength(2);
    const grande = layouts.find((l: { width: number }) => l.width === 1920);
    expect(grande.layout.find((p: { i: string }) => p.i === 'email').w).toBe(6);
  });

  // Sem tamanho não dá para saber a que tela a disposição pertence.
  it('recusa gravar sem o tamanho da janela', async () => {
    expect((await route(req({ layout: disp }))).status).toBe(400);
  });

  it('recusa tamanho que não vem de tela nenhuma', async () => {
    for (const viewport of [
      { width: 0, height: 900 },
      { width: -1, height: 900 },
      { width: 1920, height: 0 },
      { width: 999_999, height: 900 },
      { width: 'grande', height: 900 },
      { width: 1920 },
    ]) {
      const res = await route(req({ layout: disp, viewport }));
      expect(res.status, JSON.stringify(viewport)).toBe(400);
    }
  });

  it('restaurar apaga as disposições de todas as telas', async () => {
    await route(req({ layout: disp, viewport: { width: 1920, height: 1080 } }));
    await route(req({ layout: disp, viewport: { width: 1512, height: 945 } }));

    const res = await route(req({ layout: null }));
    expect((await res.json()).layouts).toEqual([]);
  });
});
