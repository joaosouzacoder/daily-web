import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const currentUser = vi.fn();
vi.mock('@/lib/auth/currentUser', () => ({ getCurrentUser: () => currentUser() }));

import { GET as listar, POST as criar, PUT as reordenar } from '@/app/api/notes/route';
import { PATCH as alterar, DELETE as apagar, POST as beacon } from '@/app/api/notes/[id]/route';

let dir: string;
const ME = { id: 'u-1', username: 'joao', passwordHash: 'x', isAdmin: true, createdAt: '' };
const OUTRO = { id: 'u-2', username: 'maria', passwordHash: 'x', isAdmin: false, createdAt: '' };

function req(body: unknown, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/notes', { method, body: JSON.stringify(body) });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-notes-api-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  vi.clearAllMocks();
  currentUser.mockResolvedValue(ME);
  const { getDb } = await import('@/lib/db');
  getDb();
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function novaNota(titulo = 'Ideias') {
  const res = await criar(req({ title: titulo }));
  return (await res.json()).note as { id: string; title: string; body: string };
}

describe('GET /api/notes', () => {
  it('lista as notas do dono da sessão', async () => {
    await novaNota('minha');
    const data = await (await listar()).json();
    expect(data.notes.map((n: { title: string }) => n.title)).toEqual(['minha']);
  });

  it('exige sessão', async () => {
    currentUser.mockResolvedValue(null);
    expect((await listar()).status).toBe(401);
  });
});

describe('POST /api/notes', () => {
  it('cria e devolve a nota', async () => {
    const nota = await novaNota('Ideias');
    expect(nota.title).toBe('Ideias');
    expect(nota.body).toBe('');
  });

  it('recusa passar do limite', async () => {
    const { MAX_NOTES } = await import('@/lib/notes');
    for (let i = 1; i < MAX_NOTES; i += 1) await novaNota(`n${i}`);
    await novaNota('ultima');

    const res = await criar(req({ title: 'demais' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/limite/);
  });

  it('exige sessão', async () => {
    currentUser.mockResolvedValue(null);
    expect((await criar(req({ title: 'x' }))).status).toBe(401);
  });
});

describe('PATCH /api/notes/[id]', () => {
  it('grava o texto', async () => {
    const nota = await novaNota();
    const res = await alterar(req({ body: 'primeira linha' }, 'PATCH'), params(nota.id));

    expect(res.status).toBe(200);
    expect((await res.json()).note.body).toBe('primeira linha');
  });

  it('grava o título', async () => {
    const nota = await novaNota();
    const res = await alterar(req({ title: 'Outro nome' }, 'PATCH'), params(nota.id));
    expect((await res.json()).note.title).toBe('Outro nome');
  });

  it('recusa corpo que não é texto', async () => {
    const nota = await novaNota();
    expect((await alterar(req({ body: 42 }, 'PATCH'), params(nota.id))).status).toBe(400);
  });

  it('recusa requisição sem nada para alterar', async () => {
    const nota = await novaNota();
    expect((await alterar(req({}, 'PATCH'), params(nota.id))).status).toBe(400);
  });

  it('recusa texto maior que o teto', async () => {
    const { MAX_BODY_LENGTH } = await import('@/lib/notes');
    const nota = await novaNota();
    const res = await alterar(
      req({ body: 'x'.repeat(MAX_BODY_LENGTH + 1) }, 'PATCH'),
      params(nota.id),
    );
    expect(res.status).toBe(400);
  });

  // A nota é buscada pelo dono da sessão: o id de outro simplesmente não
  // encontra linha, e a resposta nunca revela que ela existe.
  it('não alcança a nota de outro usuário', async () => {
    currentUser.mockResolvedValue(OUTRO);
    const dela = await novaNota('dela');

    currentUser.mockResolvedValue(ME);
    const res = await alterar(req({ body: 'invadido' }, 'PATCH'), params(dela.id));
    expect(res.status).toBe(404);

    currentUser.mockResolvedValue(OUTRO);
    const data = await (await listar()).json();
    expect(data.notes[0].body).toBe('');
  });

  it('exige sessão', async () => {
    const nota = await novaNota();
    currentUser.mockResolvedValue(null);
    expect((await alterar(req({ body: 'x' }, 'PATCH'), params(nota.id))).status).toBe(401);
  });
});

// O sendBeacon, que salva o que foi digitado quando a aba fecha, só faz POST.
describe('POST /api/notes/[id]', () => {
  it('grava igual ao PATCH', async () => {
    const nota = await novaNota();
    const res = await beacon(req({ body: 'salvo na saída' }), params(nota.id));
    expect((await res.json()).note.body).toBe('salvo na saída');
  });

  it('também não alcança a nota de outro', async () => {
    currentUser.mockResolvedValue(OUTRO);
    const dela = await novaNota('dela');
    currentUser.mockResolvedValue(ME);
    expect((await beacon(req({ body: 'x' }), params(dela.id))).status).toBe(404);
  });
});

describe('DELETE /api/notes/[id]', () => {
  it('apaga a própria nota', async () => {
    const nota = await novaNota();
    expect((await apagar(req({}, 'DELETE'), params(nota.id))).status).toBe(200);
    expect((await (await listar()).json()).notes).toEqual([]);
  });

  it('não apaga a nota de outro', async () => {
    currentUser.mockResolvedValue(OUTRO);
    const dela = await novaNota('dela');
    currentUser.mockResolvedValue(ME);

    expect((await apagar(req({}, 'DELETE'), params(dela.id))).status).toBe(404);
    currentUser.mockResolvedValue(OUTRO);
    expect((await (await listar()).json()).notes).toHaveLength(1);
  });
});

describe('PUT /api/notes', () => {
  it('reordena as abas', async () => {
    const a = await novaNota('A');
    const b = await novaNota('B');

    const res = await reordenar(req({ ids: [b.id, a.id] }, 'PUT'));
    expect((await res.json()).notes.map((n: { title: string }) => n.title)).toEqual(['B', 'A']);
  });

  it('recusa lista que não é de textos', async () => {
    expect((await reordenar(req({ ids: [1, 2] }, 'PUT'))).status).toBe(400);
    expect((await reordenar(req({ ids: 'a,b' }, 'PUT'))).status).toBe(400);
  });

  it('exige sessão', async () => {
    currentUser.mockResolvedValue(null);
    expect((await reordenar(req({ ids: [] }, 'PUT'))).status).toBe(401);
  });
});
