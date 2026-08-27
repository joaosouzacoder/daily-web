import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import type { Note } from './types';

/** Uma aba é uma nota. Mais que isto deixa de ser bloco de notas e vira um
 *  gerenciador de arquivos que ninguém pediu — e a coluna de abas não cabe. */
export const MAX_NOTES = 100;
export const MAX_TITLE_LENGTH = 120;
/** Cem mil caracteres é muito mais do que se digita numa nota rápida, e ainda
 *  assim é um teto: sem ele uma requisição pode gravar o que quiser. */
export const MAX_BODY_LENGTH = 100_000;

export class NoteLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoteLimitError';
  }
}

interface Row {
  id: string;
  title: string;
  body: string;
  position: number;
  updated_at: string;
}

function toNote(row: Row): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    position: row.position,
    updatedAt: row.updated_at,
  };
}

export function listNotes(userId: string): Note[] {
  const rows = getDb()
    .prepare(
      'SELECT id, title, body, position, updated_at FROM notes WHERE user_id = ? ORDER BY position, created_at',
    )
    .all(userId) as Row[];
  return rows.map(toNote);
}

export function countNotes(userId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS total FROM notes WHERE user_id = ?')
    .get(userId) as { total: number };
  return row.total;
}

export function createNote(userId: string, title = ''): Note {
  if (countNotes(userId) >= MAX_NOTES) {
    throw new NoteLimitError(`o limite é de ${MAX_NOTES} notas`);
  }

  const row = getDb()
    .prepare('SELECT COALESCE(MAX(position), -1) AS last FROM notes WHERE user_id = ?')
    .get(userId) as { last: number };

  const note: Note = {
    id: randomUUID(),
    title: title.slice(0, MAX_TITLE_LENGTH),
    body: '',
    position: row.last + 1,
    updatedAt: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `INSERT INTO notes (id, user_id, title, body, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(note.id, userId, note.title, note.body, note.position, note.updatedAt, note.updatedAt);

  return note;
}

export interface NotePatch {
  title?: string;
  body?: string;
}

/**
 * Grava o que mudou e devolve a nota, ou null quando ela não é do usuário —
 * o dono entra na cláusula, então um id de outra pessoa simplesmente não
 * encontra linha.
 */
export function updateNote(userId: string, id: string, patch: NotePatch): Note | null {
  if (patch.title !== undefined && patch.title.length > MAX_TITLE_LENGTH) {
    throw new NoteLimitError(`o título aceita até ${MAX_TITLE_LENGTH} caracteres`);
  }
  if (patch.body !== undefined && patch.body.length > MAX_BODY_LENGTH) {
    throw new NoteLimitError(`a nota aceita até ${MAX_BODY_LENGTH} caracteres`);
  }

  const atual = getDb()
    .prepare('SELECT id, title, body, position, updated_at FROM notes WHERE id = ? AND user_id = ?')
    .get(id, userId) as Row | undefined;
  if (!atual) return null;

  const title = patch.title ?? atual.title;
  const body = patch.body ?? atual.body;
  const updatedAt = new Date().toISOString();

  getDb()
    .prepare('UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(title, body, updatedAt, id, userId);

  return { id, title, body, position: atual.position, updatedAt };
}

export function deleteNote(userId: string, id: string): boolean {
  return getDb().prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

/**
 * Reordena as abas segundo a lista de ids. Ids que não são do usuário são
 * ignorados, e as notas que ficaram de fora vão para o fim na ordem em que
 * já estavam — assim uma lista incompleta não descarta nada.
 */
export function reorderNotes(userId: string, ids: string[]): Note[] {
  const db = getDb();
  const atuais = listNotes(userId);
  const conhecidos = new Set(atuais.map((n) => n.id));

  const ordenados = ids.filter((id) => conhecidos.has(id));
  const vistos = new Set(ordenados);
  const restantes = atuais.filter((n) => !vistos.has(n.id)).map((n) => n.id);
  const final = [...new Set([...ordenados, ...restantes])];

  db.transaction(() => {
    const stmt = db.prepare('UPDATE notes SET position = ? WHERE id = ? AND user_id = ?');
    final.forEach((id, index) => stmt.run(index, id, userId));
  })();

  return listNotes(userId);
}
