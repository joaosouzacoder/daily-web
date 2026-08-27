import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let dir: string;
const USER = 'u-1';
const OUTRO = 'u-2';

async function lib() {
  return import('@/lib/notes');
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-notes-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  const { getDb } = await import('@/lib/db');
  getDb();
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('notas', () => {
  it('começa sem nota nenhuma', async () => {
    const { listNotes } = await lib();
    expect(listNotes(USER)).toEqual([]);
  });

  it('cria uma nota vazia com título', async () => {
    const { createNote, listNotes } = await lib();
    const nota = createNote(USER, 'Ideias');

    expect(nota.title).toBe('Ideias');
    expect(nota.body).toBe('');
    expect(listNotes(USER)).toHaveLength(1);
  });

  it('grava o texto e devolve a nota atualizada', async () => {
    const { createNote, updateNote, listNotes } = await lib();
    const nota = createNote(USER, 'Ideias');

    const salva = updateNote(USER, nota.id, { body: 'primeira linha' });
    expect(salva?.body).toBe('primeira linha');
    expect(listNotes(USER)[0].body).toBe('primeira linha');
  });

  it('alterar só o título preserva o texto', async () => {
    const { createNote, updateNote } = await lib();
    const nota = createNote(USER, 'Ideias');
    updateNote(USER, nota.id, { body: 'conteúdo' });

    const salva = updateNote(USER, nota.id, { title: 'Outro nome' });
    expect(salva?.title).toBe('Outro nome');
    expect(salva?.body).toBe('conteúdo');
  });

  it('apaga', async () => {
    const { createNote, deleteNote, listNotes } = await lib();
    const nota = createNote(USER, 'Ideias');

    expect(deleteNote(USER, nota.id)).toBe(true);
    expect(listNotes(USER)).toEqual([]);
  });

  it('as abas saem na ordem em que foram criadas', async () => {
    const { createNote, listNotes } = await lib();
    createNote(USER, 'A');
    createNote(USER, 'B');
    createNote(USER, 'C');
    expect(listNotes(USER).map((n) => n.title)).toEqual(['A', 'B', 'C']);
  });
});

// A nota é do usuário: é essa cláusula que impede alguém de ler ou escrever
// na nota de outra pessoa mandando o id dela.
describe('isolamento entre usuários', () => {
  it('cada um vê só as suas', async () => {
    const { createNote, listNotes } = await lib();
    createNote(USER, 'minha');
    createNote(OUTRO, 'dele');

    expect(listNotes(USER).map((n) => n.title)).toEqual(['minha']);
    expect(listNotes(OUTRO).map((n) => n.title)).toEqual(['dele']);
  });

  it('não dá para escrever na nota de outro', async () => {
    const { createNote, updateNote, listNotes } = await lib();
    const alheia = createNote(OUTRO, 'dele');

    expect(updateNote(USER, alheia.id, { body: 'invadido' })).toBeNull();
    expect(listNotes(OUTRO)[0].body).toBe('');
  });

  it('não dá para apagar a nota de outro', async () => {
    const { createNote, deleteNote, listNotes } = await lib();
    const alheia = createNote(OUTRO, 'dele');

    expect(deleteNote(USER, alheia.id)).toBe(false);
    expect(listNotes(OUTRO)).toHaveLength(1);
  });

  it('reordenar não alcança a nota de outro', async () => {
    const { createNote, reorderNotes, listNotes } = await lib();
    const minha = createNote(USER, 'minha');
    const alheia = createNote(OUTRO, 'dele');

    reorderNotes(USER, [alheia.id, minha.id]);
    expect(listNotes(USER).map((n) => n.id)).toEqual([minha.id]);
    expect(listNotes(OUTRO)[0].position).toBe(0);
  });
});

describe('limites', () => {
  it('recusa passar do teto de notas', async () => {
    const { createNote, MAX_NOTES } = await lib();
    for (let i = 0; i < MAX_NOTES; i += 1) createNote(USER, `n${i}`);
    expect(() => createNote(USER, 'demais')).toThrow(/limite/);
  });

  it('o teto é por usuário', async () => {
    const { createNote, MAX_NOTES } = await lib();
    for (let i = 0; i < MAX_NOTES; i += 1) createNote(USER, `n${i}`);
    expect(() => createNote(OUTRO, 'ok')).not.toThrow();
  });

  it('recusa texto acima do teto em vez de cortar em silêncio', async () => {
    const { createNote, updateNote, MAX_BODY_LENGTH } = await lib();
    const nota = createNote(USER, 'Ideias');
    expect(() => updateNote(USER, nota.id, { body: 'x'.repeat(MAX_BODY_LENGTH + 1) })).toThrow(
      /caracteres/,
    );
  });

  it('aceita exatamente o teto', async () => {
    const { createNote, updateNote, MAX_BODY_LENGTH } = await lib();
    const nota = createNote(USER, 'Ideias');
    expect(() => updateNote(USER, nota.id, { body: 'x'.repeat(MAX_BODY_LENGTH) })).not.toThrow();
  });

  it('recusa título acima do teto', async () => {
    const { createNote, updateNote, MAX_TITLE_LENGTH } = await lib();
    const nota = createNote(USER, 'Ideias');
    expect(() => updateNote(USER, nota.id, { title: 'x'.repeat(MAX_TITLE_LENGTH + 1) })).toThrow(
      /caracteres/,
    );
  });
});

describe('reordenar', () => {
  it('põe as abas na ordem pedida', async () => {
    const { createNote, reorderNotes } = await lib();
    const a = createNote(USER, 'A');
    const b = createNote(USER, 'B');
    const c = createNote(USER, 'C');

    const depois = reorderNotes(USER, [c.id, a.id, b.id]);
    expect(depois.map((n) => n.title)).toEqual(['C', 'A', 'B']);
  });

  // Uma lista incompleta não pode fazer nota sumir.
  it('manda para o fim o que ficou de fora da lista', async () => {
    const { createNote, reorderNotes } = await lib();
    const a = createNote(USER, 'A');
    createNote(USER, 'B');
    const c = createNote(USER, 'C');

    const depois = reorderNotes(USER, [c.id, a.id]);
    expect(depois.map((n) => n.title)).toEqual(['C', 'A', 'B']);
  });

  it('ignora id repetido sem duplicar a nota', async () => {
    const { createNote, reorderNotes } = await lib();
    const a = createNote(USER, 'A');
    const b = createNote(USER, 'B');

    const depois = reorderNotes(USER, [a.id, a.id, b.id]);
    expect(depois.map((n) => n.title)).toEqual(['A', 'B']);
  });

  it('ignora id que não existe', async () => {
    const { createNote, reorderNotes } = await lib();
    const a = createNote(USER, 'A');
    expect(reorderNotes(USER, ['inexistente', a.id]).map((n) => n.title)).toEqual(['A']);
  });
});
