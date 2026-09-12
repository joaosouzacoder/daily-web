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
  folder_id: string | null;
}

function toNote(row: Row): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    position: row.position,
    updatedAt: row.updated_at,
    folderId: row.folder_id,
  };
}

export function listNotes(userId: string): Note[] {
  const rows = getDb()
    .prepare(
      `SELECT id, title, body, position, updated_at, folder_id FROM notes
       WHERE user_id = ? ORDER BY position, created_at`,
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

export function createNote(userId: string, title = '', folderId: string | null = null): Note {
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
    folderId,
  };

  getDb()
    .prepare(
      `INSERT INTO notes (id, user_id, title, body, position, created_at, updated_at, folder_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      note.id,
      userId,
      note.title,
      note.body,
      note.position,
      note.updatedAt,
      note.updatedAt,
      note.folderId,
    );

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
    .prepare(
      `SELECT id, title, body, position, updated_at, folder_id FROM notes
       WHERE id = ? AND user_id = ?`,
    )
    .get(id, userId) as Row | undefined;
  if (!atual) return null;

  const title = patch.title ?? atual.title;
  const body = patch.body ?? atual.body;
  const updatedAt = new Date().toISOString();

  getDb()
    .prepare(
      `UPDATE notes SET title = ?, body = ?, updated_at = ?, revision = revision + 1
       WHERE id = ? AND user_id = ?`,
    )
    .run(title, body, updatedAt, id, userId);

  return { id, title, body, position: atual.position, updatedAt, folderId: atual.folder_id };
}

/**
 * Muda a nota de pasta. `folderId` null tira a nota de qualquer pasta. A
 * pasta é conferida contra as do próprio usuário, então um id de outra pessoa
 * não move nada. Devolve null quando a nota não é do usuário.
 */
export function moveNote(userId: string, id: string, folderId: string | null): Note | null {
  const db = getDb();
  if (folderId !== null) {
    const folder = db
      .prepare('SELECT 1 AS ok FROM note_folders WHERE id = ? AND user_id = ?')
      .get(folderId, userId);
    if (!folder) throw new NoteLimitError('pasta não encontrada');
  }

  const changed = db
    .prepare(
      `UPDATE notes SET folder_id = ?, revision = revision + 1
       WHERE id = ? AND user_id = ?`,
    )
    .run(folderId, id, userId).changes;
  if (changed === 0) return null;

  const row = db
    .prepare(
      `SELECT id, title, body, position, updated_at, folder_id FROM notes
       WHERE id = ? AND user_id = ?`,
    )
    .get(id, userId) as Row;
  return toNote(row);
}

/** Apagar uma nota que já chegou ao Drive deixa o registro para o arquivo de
 *  lá ir para a lixeira — na mesma transação, para não haver instante em que
 *  a nota sumiu daqui e ninguém lembra de tirá-la de lá. */
export function deleteNote(userId: string, id: string): boolean {
  const db = getDb();
  return db.transaction(() => {
    const row = db
      .prepare('SELECT synced_revision FROM notes WHERE id = ? AND user_id = ?')
      .get(id, userId) as { synced_revision: number } | undefined;
    if (!row) return false;
    if (row.synced_revision > 0) {
      db.prepare(
        `INSERT OR REPLACE INTO note_deletions (user_id, note_id, deleted_at) VALUES (?, ?, ?)`,
      ).run(userId, id, new Date().toISOString());
    }
    db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, userId);
    return true;
  })();
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

  // Só a nota que mudou de lugar sobe de revisão: arrastar uma aba não pode
  // reenviar as cem para o Drive.
  db.transaction(() => {
    const stmt = db.prepare(
      `UPDATE notes SET position = ?, revision = revision + 1
       WHERE id = ? AND user_id = ? AND position != ?`,
    );
    final.forEach((id, index) => stmt.run(index, id, userId, index));
  })();

  return listNotes(userId);
}

// --- Sincronização com o Drive ------------------------------------------------

/** Uma nota junto da revisão que está sendo enviada. */
export interface PendingNote extends Note {
  revision: number;
}

export function pendingNotes(userId: string): PendingNote[] {
  const rows = getDb()
    .prepare(
      `SELECT id, title, body, position, updated_at, folder_id, revision FROM notes
       WHERE user_id = ? AND revision != synced_revision ORDER BY position, created_at`,
    )
    .all(userId) as (Row & { revision: number })[];
  return rows.map((row) => ({ ...toNote(row), revision: row.revision }));
}

/** Marca como enviada a revisão que subiu. Se a nota foi editada enquanto o
 *  envio estava no ar, a revisão local já é maior e ela continua pendente. */
export function markNoteSynced(userId: string, id: string, revision: number): void {
  getDb()
    .prepare(
      `UPDATE notes SET synced_revision = MAX(synced_revision, ?) WHERE id = ? AND user_id = ?`,
    )
    .run(revision, id, userId);
}

export function pendingDeletions(userId: string): string[] {
  const rows = getDb()
    .prepare('SELECT note_id FROM note_deletions WHERE user_id = ? ORDER BY deleted_at')
    .all(userId) as { note_id: string }[];
  return rows.map((r) => r.note_id);
}

export function clearDeletion(userId: string, noteId: string): void {
  getDb().prepare('DELETE FROM note_deletions WHERE user_id = ? AND note_id = ?').run(userId, noteId);
}

export function countPendingSync(userId: string): number {
  const row = getDb()
    .prepare(
      `SELECT (SELECT COUNT(*) FROM notes WHERE user_id = ? AND revision != synced_revision)
            + (SELECT COUNT(*) FROM note_deletions WHERE user_id = ?) AS total`,
    )
    .get(userId, userId) as { total: number };
  return row.total;
}

export interface RestoredNote {
  id: string;
  title: string;
  body: string;
  position: number;
  updatedAt: string;
  /** A pasta onde a nota estava. Um id que não veio junto vira "Sem pasta". */
  folderId?: string | null;
}

/**
 * Traz de volta as notas guardadas no Drive. Só age com o banco sem nota
 * nenhuma — é a máquina nova, ou a que perdeu o disco. Com notas locais, o
 * que está aqui é mais novo que qualquer cópia, e misturar as duas criaria
 * duplicatas. Devolve quantas entraram.
 *
 * Um arquivo do Drive é entrada de fora: o que passar dos limites fica lá e
 * não entra, em vez de ser cortado aqui e o corte subir de volta por cima.
 */
export function restoreNotes(userId: string, remote: RestoredNote[]): number {
  const db = getDb();
  return db.transaction(() => {
    if (countNotes(userId) > 0) return 0;

    const accepted = remote
      .filter((n) => n.title.length <= MAX_TITLE_LENGTH && n.body.length <= MAX_BODY_LENGTH)
      .sort((a, b) => a.position - b.position)
      .slice(0, MAX_NOTES);

    const taken = db.prepare('SELECT 1 FROM notes WHERE id = ?');
    const insert = db.prepare(
      `INSERT INTO notes (id, user_id, title, body, position, created_at, updated_at, folder_id, revision, synced_revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    );
    accepted.forEach((note, index) => {
      // O id é global. Se outra pessoa desta instância já usa o mesmo — as
      // duas conectaram a mesma conta Google —, a nota entra com id novo e
      // pendente, e sobe como um arquivo à parte em vez de disputar o dela.
      const clash = taken.get(note.id) !== undefined;
      insert.run(
        clash ? randomUUID() : note.id,
        userId,
        note.title,
        note.body,
        index,
        note.updatedAt,
        note.updatedAt,
        note.folderId ?? null,
        clash ? 0 : 1,
      );
    });
    return accepted.length;
  })();
}
