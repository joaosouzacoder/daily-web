import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const currentUser = vi.fn();
vi.mock('@/lib/auth/currentUser', () => ({ getCurrentUser: () => currentUser() }));

import { GET as listarPastas, POST as criarPasta } from '@/app/api/notes/folders/route';
import {
  PATCH as alterarPasta,
  DELETE as apagarPasta,
} from '@/app/api/notes/folders/[id]/route';
import { GET as listarNotas, POST as criarNota } from '@/app/api/notes/route';
import { PATCH as alterarNota } from '@/app/api/notes/[id]/route';

let dir: string;
const ME = { id: 'u-1', username: 'joao', passwordHash: 'x', isAdmin: true, createdAt: '' };
const OUTRO = { id: 'u-2', username: 'maria', passwordHash: 'x', isAdmin: false, createdAt: '' };

function req(body: unknown, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/notes/folders', {
    method,
    body: JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-folders-api-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  vi.clearAllMocks();
  currentUser.mockResolvedValue(ME);
  const { getDb } = await import('@/lib/db');
  getDb();
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function novaPasta(name: string, parentId: string | null = null) {
  const res = await criarPasta(req({ name, parentId }));
  return (await res.json()).folder as { id: string; name: string; parentId: string | null };
}

async function novaNota(title = 'Ideias', folderId: string | null = null) {
  const res = await criarNota(req({ title, folderId }));
  return (await res.json()).note as { id: string; folderId: string | null };
}

describe('POST /api/notes/folders', () => {
  it('cria uma pasta e uma subpasta', async () => {
    const pai = await novaPasta('Trabalho');
    const filha = await novaPasta('Clientes', pai.id);

    expect(filha.parentId).toBe(pai.id);
    const data = await (await listarPastas()).json();
    expect(data.folders).toHaveLength(2);
  });

  it('exige sessão', async () => {
    currentUser.mockResolvedValue(null);
    expect((await criarPasta(req({ name: 'x' }))).status).toBe(401);
    expect((await listarPastas()).status).toBe(401);
  });

  it('recusa nome que não é texto', async () => {
    expect((await criarPasta(req({ name: 42 }))).status).toBe(400);
  });

  it('recusa nome vazio', async () => {
    expect((await criarPasta(req({ name: '  ' }))).status).toBe(400);
  });

  it('não vê nem usa a pasta de outra pessoa', async () => {
    currentUser.mockResolvedValue(OUTRO);
    const alheia = await novaPasta('Deles');

    currentUser.mockResolvedValue(ME);
    const data = await (await listarPastas()).json();
    expect(data.folders).toEqual([]);
    expect((await criarPasta(req({ name: 'Minha', parentId: alheia.id }))).status).toBe(400);
  });
});

describe('PATCH /api/notes/folders/[id]', () => {
  it('renomeia', async () => {
    const pasta = await novaPasta('Trabalho');
    const res = await alterarPasta(req({ name: 'Projetos' }, 'PATCH'), params(pasta.id));

    expect((await res.json()).folder.name).toBe('Projetos');
  });

  it('move para dentro de outra e de volta para a raiz', async () => {
    const a = await novaPasta('A');
    const b = await novaPasta('B');

    const dentro = await alterarPasta(req({ parentId: a.id }, 'PATCH'), params(b.id));
    expect((await dentro.json()).folder.parentId).toBe(a.id);

    const fora = await alterarPasta(req({ parentId: null }, 'PATCH'), params(b.id));
    expect((await fora.json()).folder.parentId).toBeNull();
  });

  it('recusa mover uma pasta para dentro de uma filha', async () => {
    const pai = await novaPasta('Pai');
    const filha = await novaPasta('Filha', pai.id);

    const res = await alterarPasta(req({ parentId: filha.id }, 'PATCH'), params(pai.id));
    expect(res.status).toBe(400);
  });

  it('pasta que não é do usuário volta 404', async () => {
    currentUser.mockResolvedValue(OUTRO);
    const alheia = await novaPasta('Deles');

    currentUser.mockResolvedValue(ME);
    const res = await alterarPasta(req({ name: 'Minha' }, 'PATCH'), params(alheia.id));
    expect(res.status).toBe(404);
  });

  it('sem nada para alterar, recusa', async () => {
    const pasta = await novaPasta('Trabalho');
    expect((await alterarPasta(req({}, 'PATCH'), params(pasta.id))).status).toBe(400);
  });
});

describe('DELETE /api/notes/folders/[id]', () => {
  it('apaga a pasta e devolve as notas para "Sem pasta"', async () => {
    const pasta = await novaPasta('Trabalho');
    const nota = await novaNota('Ideias', pasta.id);
    expect(nota.folderId).toBe(pasta.id);

    expect((await apagarPasta(req(null, 'DELETE'), params(pasta.id))).status).toBe(200);

    const data = await (await listarNotas()).json();
    expect(data.folders).toEqual([]);
    expect(data.notes[0].folderId).toBeNull();
    expect(data.notes[0].title).toBe('Ideias');
  });

  it('pasta de outra pessoa volta 404 e continua lá', async () => {
    currentUser.mockResolvedValue(OUTRO);
    const alheia = await novaPasta('Deles');

    currentUser.mockResolvedValue(ME);
    expect((await apagarPasta(req(null, 'DELETE'), params(alheia.id))).status).toBe(404);

    currentUser.mockResolvedValue(OUTRO);
    expect((await (await listarPastas()).json()).folders).toHaveLength(1);
  });
});

describe('PATCH /api/notes/[id] com pasta', () => {
  it('move a nota para uma pasta e para fora dela', async () => {
    const pasta = await novaPasta('Trabalho');
    const nota = await novaNota('Ideias');

    const dentro = await alterarNota(req({ folderId: pasta.id }, 'PATCH'), params(nota.id));
    expect((await dentro.json()).note.folderId).toBe(pasta.id);

    const fora = await alterarNota(req({ folderId: null }, 'PATCH'), params(nota.id));
    expect((await fora.json()).note.folderId).toBeNull();
  });

  it('gravar o texto sem falar de pasta não tira a nota do lugar', async () => {
    const pasta = await novaPasta('Trabalho');
    const nota = await novaNota('Ideias', pasta.id);

    const res = await alterarNota(req({ body: 'texto' }, 'PATCH'), params(nota.id));
    const { note } = await res.json();
    expect(note.folderId).toBe(pasta.id);
    expect(note.body).toBe('texto');
  });

  it('recusa mover para a pasta de outra pessoa', async () => {
    currentUser.mockResolvedValue(OUTRO);
    const alheia = await novaPasta('Deles');

    currentUser.mockResolvedValue(ME);
    const nota = await novaNota('Ideias');
    const res = await alterarNota(req({ folderId: alheia.id }, 'PATCH'), params(nota.id));
    expect(res.status).toBe(400);
  });
});
