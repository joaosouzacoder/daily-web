import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import { NoteLimitError } from './notes';
import {
  descendantIds,
  MAX_FOLDER_NAME_LENGTH,
  MAX_FOLDERS,
  refuseMove,
  type MoveRefusal,
} from './notesTree';
import type { NoteFolder } from './types';

export class FolderMoveError extends Error {
  constructor(
    message: string,
    readonly reason: MoveRefusal,
  ) {
    super(message);
    this.name = 'FolderMoveError';
  }
}

const RECUSA: Record<MoveRefusal, string> = {
  unknown: 'pasta não encontrada',
  cycle: 'uma pasta não pode ir para dentro de si mesma',
  depth: 'a hierarquia de pastas ficou funda demais',
};

interface Row {
  id: string;
  name: string;
  parent_id: string | null;
  position: number;
  updated_at: string;
}

function toFolder(row: Row): NoteFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    position: row.position,
    updatedAt: row.updated_at,
  };
}

export function listFolders(userId: string): NoteFolder[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, parent_id, position, updated_at FROM note_folders
       WHERE user_id = ? ORDER BY position, created_at`,
    )
    .all(userId) as Row[];
  return rows.map(toFolder);
}

function nextPosition(userId: string, parentId: string | null): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(MAX(position), -1) AS last FROM note_folders
       WHERE user_id = ? AND parent_id IS ?`,
    )
    .get(userId, parentId) as { last: number };
  return row.last + 1;
}

/** Nome vazio não vira pasta sem nome: é recusado na borda, junto do teto de
 *  tamanho, para o que entra no banco já estar válido. */
function cleanName(name: string): string {
  const clean = name.trim();
  if (!clean) throw new NoteLimitError('a pasta precisa de um nome');
  if (clean.length > MAX_FOLDER_NAME_LENGTH) {
    throw new NoteLimitError(`o nome da pasta aceita até ${MAX_FOLDER_NAME_LENGTH} caracteres`);
  }
  return clean;
}

export function createFolder(userId: string, name: string, parentId: string | null = null): NoteFolder {
  const clean = cleanName(name);
  const folders = listFolders(userId);
  if (folders.length >= MAX_FOLDERS) {
    throw new NoteLimitError(`o limite é de ${MAX_FOLDERS} pastas`);
  }
  if (parentId !== null && !folders.some((f) => f.id === parentId)) {
    throw new FolderMoveError(RECUSA.unknown, 'unknown');
  }

  const now = new Date().toISOString();
  const folder: NoteFolder = {
    id: randomUUID(),
    name: clean,
    parentId,
    position: nextPosition(userId, parentId),
    updatedAt: now,
  };
  // A pasta nova nasce dentro do teto de profundidade como qualquer movida.
  const refusal = refuseMove([...folders, folder], folder.id, parentId);
  if (refusal) throw new FolderMoveError(RECUSA[refusal], refusal);

  getDb()
    .prepare(
      `INSERT INTO note_folders (id, user_id, parent_id, name, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(folder.id, userId, parentId, folder.name, folder.position, now, now);
  return folder;
}

export function renameFolder(userId: string, id: string, name: string): NoteFolder | null {
  const clean = cleanName(name);
  const now = new Date().toISOString();
  const changed = getDb()
    .prepare(
      `UPDATE note_folders SET name = ?, updated_at = ?, revision = revision + 1
       WHERE id = ? AND user_id = ?`,
    )
    .run(clean, now, id, userId).changes;
  if (changed === 0) return null;
  return listFolders(userId).find((f) => f.id === id) ?? null;
}

/**
 * Muda a pasta de lugar na árvore. Recusa o que quebraria a hierarquia —
 * destino inexistente, destino dentro da própria pasta, ou um ramo que não
 * cabe na profundidade máxima — em vez de gravar uma árvore impossível.
 */
export function moveFolder(userId: string, id: string, parentId: string | null): NoteFolder {
  const folders = listFolders(userId);
  const refusal = refuseMove(folders, id, parentId);
  if (refusal) throw new FolderMoveError(RECUSA[refusal], refusal);

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE note_folders SET parent_id = ?, position = ?, updated_at = ?, revision = revision + 1
       WHERE id = ? AND user_id = ?`,
    )
    .run(parentId, nextPosition(userId, parentId), now, id, userId);
  return listFolders(userId).find((f) => f.id === id)!;
}

/**
 * Apaga a pasta e as subpastas. As notas que estavam dentro não são apagadas:
 * vão para "Sem pasta", que é a única saída que não perde texto. Cada nota
 * movida sobe de revisão, porque a cópia no Drive muda de pasta junto.
 */
export function deleteFolder(userId: string, id: string): boolean {
  const db = getDb();
  return db.transaction(() => {
    const ids = descendantIds(listFolders(userId), id);
    if (ids.length === 0) return false;
    const marks = ids.map(() => '?').join(', ');

    db.prepare(
      `UPDATE notes SET folder_id = NULL, revision = revision + 1
       WHERE user_id = ? AND folder_id IN (${marks})`,
    ).run(userId, ...ids);

    const deletedAt = new Date().toISOString();
    const record = db.prepare(
      `INSERT OR REPLACE INTO note_folder_deletions (user_id, folder_id, deleted_at)
       VALUES (?, ?, ?)`,
    );
    const synced = db.prepare(
      'SELECT synced_revision FROM note_folders WHERE id = ? AND user_id = ?',
    );
    for (const folderId of ids) {
      const row = synced.get(folderId, userId) as { synced_revision: number } | undefined;
      // Só o que chegou ao Drive precisa ser tirado de lá.
      if (row && row.synced_revision > 0) record.run(userId, folderId, deletedAt);
    }

    db.prepare(
      `DELETE FROM note_folders WHERE user_id = ? AND id IN (${marks})`,
    ).run(userId, ...ids);
    return true;
  })();
}

// --- Sincronização com o Drive ------------------------------------------------

export interface PendingFolder extends NoteFolder {
  revision: number;
}

/** As pastas cuja cópia no Drive está atrasada, das de fora para as de
 *  dentro: a pasta pai precisa existir lá antes da filha. */
export function pendingFolders(userId: string): PendingFolder[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, parent_id, position, updated_at, revision FROM note_folders
       WHERE user_id = ? AND revision != synced_revision`,
    )
    .all(userId) as (Row & { revision: number })[];

  const all = listFolders(userId);
  const byId = new Map(all.map((f) => [f.id, f]));
  const depthOf = (folder: NoteFolder): number => {
    let steps = 0;
    let current = folder.parentId;
    while (current && steps <= byId.size) {
      steps += 1;
      current = byId.get(current)?.parentId ?? null;
    }
    return steps;
  };

  return rows
    .map((row) => ({ ...toFolder(row), revision: row.revision }))
    .sort((a, b) => depthOf(a) - depthOf(b) || a.position - b.position);
}

export function markFolderSynced(userId: string, id: string, revision: number): void {
  getDb()
    .prepare(
      `UPDATE note_folders SET synced_revision = MAX(synced_revision, ?)
       WHERE id = ? AND user_id = ?`,
    )
    .run(revision, id, userId);
}

export function pendingFolderDeletions(userId: string): string[] {
  const rows = getDb()
    .prepare('SELECT folder_id FROM note_folder_deletions WHERE user_id = ? ORDER BY deleted_at')
    .all(userId) as { folder_id: string }[];
  return rows.map((r) => r.folder_id);
}

export function clearFolderDeletion(userId: string, folderId: string): void {
  getDb()
    .prepare('DELETE FROM note_folder_deletions WHERE user_id = ? AND folder_id = ?')
    .run(userId, folderId);
}

export function countPendingFolderSync(userId: string): number {
  const row = getDb()
    .prepare(
      `SELECT (SELECT COUNT(*) FROM note_folders WHERE user_id = ? AND revision != synced_revision)
            + (SELECT COUNT(*) FROM note_folder_deletions WHERE user_id = ?) AS total`,
    )
    .get(userId, userId) as { total: number };
  return row.total;
}

/** Guarda a pasta que veio do Drive na restauração, com o id que ela tinha
 *  lá. Só é chamada com o banco de pastas vazio, junto da restauração das
 *  notas. */
export function restoreFolders(userId: string, remote: NoteFolder[]): number {
  const db = getDb();
  return db.transaction(() => {
    if (listFolders(userId).length > 0) return 0;
    const accepted = remote.filter((f) => f.name.trim().length > 0).slice(0, MAX_FOLDERS);
    const known = new Set(accepted.map((f) => f.id));

    const insert = db.prepare(
      `INSERT OR IGNORE INTO note_folders
         (id, user_id, parent_id, name, position, created_at, updated_at, revision, synced_revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
    );
    accepted.forEach((folder, index) => {
      // Um pai que não veio junto viraria uma pasta invisível: ela sobe para
      // a raiz, do mesmo jeito que a árvore da tela faz.
      const parentId = folder.parentId && known.has(folder.parentId) ? folder.parentId : null;
      insert.run(
        folder.id,
        userId,
        parentId,
        folder.name.slice(0, MAX_FOLDER_NAME_LENGTH),
        index,
        folder.updatedAt,
        folder.updatedAt,
      );
    });
    return accepted.length;
  })();
}
