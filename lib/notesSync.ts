import { accessToken, googleClient } from '@/lib/integrations/google/oauth';
import * as drive from '@/lib/integrations/google/drive';
import {
  clearDeletion,
  countNotes,
  countPendingSync,
  MAX_BODY_LENGTH,
  markNoteSynced,
  pendingDeletions,
  pendingNotes,
  restoreNotes,
} from '@/lib/notes';
import {
  clearFolderDeletion,
  countPendingFolderSync,
  listFolders,
  markFolderSynced,
  pendingFolderDeletions,
  pendingFolders,
  restoreFolders,
} from '@/lib/noteFolders';
import { MAX_FOLDER_DEPTH } from '@/lib/notesTree';
import { listConnections, type Connection } from '@/lib/vault/connections';

// O banco local continua sendo onde a nota é gravada — digitar não pode
// esperar a rede. O Drive é a cópia durável: cada gravação marca a nota como
// pendente e esta rotina, logo depois, sobe o que estiver pendente. Se o
// Google falhar, a nota segue pendente e vai na próxima rodada; nada se perde
// aqui por causa de lá.

/** Espera depois da última gravação antes de subir. O autosave grava a cada
 *  pausa na digitação; sem juntar, cada pausa viraria uma ida ao Drive. */
export const SYNC_DEBOUNCE_MS = 3_000;

export interface NotesSyncStatus {
  connected: boolean;
  account: string;
  pending: number;
  lastError: string | null;
  lastSyncedAt: string | null;
}

export interface SyncResult {
  uploaded: number;
  trashed: number;
  restored: number;
}

// Como uma pasta daqui vira uma pasta lá
// ----------------------------------------------------------------------------
// A hierarquia é espelhada: dentro da pasta raiz da app, cada pasta de notas
// é uma pasta do Drive marcada com `dailyWeb=noteFolder` e o `folderId`
// daqui, e o arquivo .md de cada nota fica dentro do espelho da pasta dela —
// nota sem pasta fica na raiz. Quem abrir o Drive vê a mesma árvore que vê
// aqui, e renomear ou mover lá não quebra nada, porque o que liga os dois
// lados é o `folderId`, não o nome nem o caminho.
//
// A direção continua sendo uma só: daqui para lá. O que volta do Drive é a
// restauração — e só quando não há nota nenhuma neste banco.

export function driveConnection(userId: string): Connection | null {
  return (
    listConnections(userId, 'notes').find(
      (c) => c.values.provider === 'google' && Boolean(c.values.refreshToken),
    ) ?? null
  );
}

/** O teste da tela de integrações: o token vale e o Drive responde. */
export async function testDriveConnection(conn: Connection): Promise<void> {
  const token = await accessToken(googleClient(), conn.values.refreshToken ?? '');
  await drive.listNoteFiles(token);
}

/**
 * Uma rodada completa: tira da lixeira o que foi apagado, restaura se o banco
 * está vazio e sobe o que está pendente. Idempotente — rodar duas vezes em
 * seguida não duplica arquivo, porque o arquivo de cada nota é achado pelo id
 * dela antes de qualquer criação.
 */
export async function syncNotes(userId: string): Promise<SyncResult> {
  const result: SyncResult = { uploaded: 0, trashed: 0, restored: 0 };
  const conn = driveConnection(userId);
  if (!conn) return result;

  const token = await accessToken(googleClient(), conn.values.refreshToken);
  const remote = await drive.listNoteFiles(token);
  const byNote = new Map(remote.map((file) => [file.noteId, file]));
  const mirrors = new Map(
    (await drive.listFolderMirrors(token)).map((mirror) => [mirror.folderId, mirror]),
  );

  // As exclusões vêm antes da restauração: quem apagou a última nota não quer
  // vê-la voltar do Drive.
  for (const noteId of pendingDeletions(userId)) {
    const file = byNote.get(noteId);
    if (file) {
      try {
        await drive.trashFile(token, file.fileId);
        result.trashed += 1;
      } catch (err) {
        if (!drive.isGone(err)) throw err;
      }
      byNote.delete(noteId);
    }
    clearDeletion(userId, noteId);
  }

  // A pasta apagada aqui vai para a lixeira lá. As notas que estavam dentro
  // já foram para "Sem pasta" e sobem de novo logo abaixo, na raiz — então a
  // pasta some sem levar texto junto.
  for (const folderId of pendingFolderDeletions(userId)) {
    const mirror = mirrors.get(folderId);
    if (mirror) {
      try {
        await drive.trashFile(token, mirror.fileId);
        result.trashed += 1;
      } catch (err) {
        if (!drive.isGone(err)) throw err;
      }
      mirrors.delete(folderId);
    }
    clearFolderDeletion(userId, folderId);
  }

  let rootId: string | null = null;
  const root = async (): Promise<string> => (rootId ??= await drive.ensureFolder(token));

  if (countNotes(userId) === 0 && byNote.size > 0) {
    // A árvore volta junto com as notas: sem ela, tudo voltaria solto.
    const mirrorByFile = new Map([...mirrors.values()].map((m) => [m.fileId, m]));
    restoreFolders(
      userId,
      [...mirrors.values()].map((mirror) => ({
        id: mirror.folderId,
        name: mirror.name,
        parentId: mirror.parents.map((p) => mirrorByFile.get(p)?.folderId ?? null).find(Boolean) ?? null,
        position: 0,
        updatedAt: new Date().toISOString(),
      })),
    );
    const known = new Set(listFolders(userId).map((f) => f.id));

    // Um arquivo maior que o teto da nota nem é baixado. Em UTF-8 um caractere
    // tem até quatro bytes, então este é o maior tamanho que ainda pode caber.
    const candidates = [...byNote.values()].filter((file) => file.size <= MAX_BODY_LENGTH * 4);
    const restored = [];
    for (const file of candidates) {
      const folderId =
        file.parents.map((p) => mirrorByFile.get(p)?.folderId).find((id) => id && known.has(id)) ??
        null;
      restored.push({
        id: file.noteId,
        title: drive.titleFrom(file),
        body: await drive.downloadFile(token, file.fileId),
        position: file.position,
        updatedAt: file.modifiedTime,
        folderId,
      });
    }
    result.restored = restoreNotes(userId, restored);
  }

  const folders = listFolders(userId);
  const byId = new Map(folders.map((f) => [f.id, f]));

  /**
   * O id da pasta do Drive onde a nota (ou a subpasta) deve ficar: o espelho
   * da pasta, criado agora se ainda não existe, e a raiz para quem não tem
   * pasta. A subida dos pais é limitada pela profundidade máxima da árvore,
   * então nem um ciclo gravado no banco faz isto girar sem fim.
   */
  const mirrorOf = async (folderId: string | null): Promise<string> => {
    if (!folderId) return root();
    const chain: string[] = [];
    let current: string | null = folderId;
    for (let step = 0; step <= MAX_FOLDER_DEPTH && current; step += 1) {
      if (mirrors.has(current)) break;
      chain.unshift(current);
      current = byId.get(current)?.parentId ?? null;
    }
    for (const id of chain) {
      const folder = byId.get(id);
      if (!folder) continue;
      const parentId = folder.parentId
        ? (mirrors.get(folder.parentId)?.fileId ?? (await root()))
        : await root();
      const fileId = await drive.createFolderMirror(token, parentId, {
        folderId: id,
        name: folder.name,
      });
      mirrors.set(id, { fileId, folderId: id, name: folder.name, parents: [parentId] });
    }
    return mirrors.get(folderId)?.fileId ?? (await root());
  };

  // As pastas sobem antes das notas: o arquivo da nota precisa de uma pasta
  // que já exista lá.
  for (const folder of pendingFolders(userId)) {
    const parentId = await mirrorOf(folder.parentId);
    const mirror = mirrors.get(folder.id);
    if (mirror) {
      try {
        await drive.updateFolderMirror(token, mirror.fileId, {
          name: folder.name,
          parentId,
          currentParents: mirror.parents,
        });
        mirrors.set(folder.id, { ...mirror, name: folder.name, parents: [parentId] });
      } catch (err) {
        if (!drive.isGone(err)) throw err;
        mirrors.delete(folder.id);
        await mirrorOf(folder.id);
      }
    } else {
      await mirrorOf(folder.id);
    }
    markFolderSynced(userId, folder.id, folder.revision);
  }

  const pending = pendingNotes(userId);
  for (const note of pending) {
    const content = { noteId: note.id, title: note.title, body: note.body, position: note.position };
    const parentId = await mirrorOf(note.folderId);
    const file = byNote.get(note.id);
    if (file) {
      try {
        await drive.updateNoteFile(token, file.fileId, content, {
          parentId,
          currentParents: file.parents,
        });
      } catch (err) {
        if (!drive.isGone(err)) throw err;
        await drive.createNoteFile(token, parentId, content);
      }
    } else {
      await drive.createNoteFile(token, parentId, content);
    }
    markNoteSynced(userId, note.id, note.revision);
    result.uploaded += 1;
  }

  return result;
}

// --- Agendamento --------------------------------------------------------------
// Estado em memória, por processo: o servidor é um processo só. Se ele
// reiniciar, o que ficou pendente está no banco e sobe na próxima gravação ou
// leitura das notas.
//
// Fica no processo, não no módulo: o build empacota este arquivo mais de uma
// vez, e cada cópia com o seu Map quebraria a trava de uma rodada por pessoa
// — duas rodadas em paralelo podem criar o mesmo arquivo duas vezes — e a
// rota de status leria uma cópia onde nenhuma rodada rodou.

interface UserSyncState {
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  /** Pediram outra rodada enquanto esta estava no ar. */
  again: boolean;
  lastError: string | null;
  lastSyncedAt: string | null;
}

const STATE_KEY = Symbol.for('daily-web.notes-sync');
const states: Map<string, UserSyncState> = ((globalThis as Record<symbol, unknown>)[STATE_KEY] ??=
  new Map<string, UserSyncState>()) as Map<string, UserSyncState>;

function stateFor(userId: string): UserSyncState {
  let state = states.get(userId);
  if (!state) {
    state = { timer: null, running: false, again: false, lastError: null, lastSyncedAt: null };
    states.set(userId, state);
  }
  return state;
}

async function run(userId: string): Promise<void> {
  const state = stateFor(userId);
  // Uma rodada por pessoa por vez: duas em paralelo podiam criar o mesmo
  // arquivo duas vezes antes de qualquer uma ver o da outra.
  if (state.running) {
    state.again = true;
    return;
  }
  state.running = true;
  try {
    do {
      state.again = false;
      try {
        await syncNotes(userId);
        state.lastError = null;
        state.lastSyncedAt = new Date().toISOString();
      } catch (err) {
        state.lastError = err instanceof Error ? err.message : String(err);
        // Só a mensagem: ela vem de nós ou do status HTTP, nunca de um token.
        console.error(`[notes-sync] user=${userId} failed: ${state.lastError}`);
      }
    } while (state.again && !state.lastError);
  } finally {
    state.running = false;
  }
}

/** Pede uma rodada para daqui a pouco. Chamadas seguidas se juntam numa só. */
export function scheduleNotesSync(userId: string): void {
  if (!driveConnection(userId)) return;
  const state = stateFor(userId);
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    void run(userId);
  }, SYNC_DEBOUNCE_MS);
  // Um timer pendente não deve segurar o processo vivo no desligamento.
  state.timer.unref?.();
}

/** Roda agora e espera — para o retorno do OAuth, que precisa restaurar as
 *  notas antes de mandar a pessoa de volta para a tela. */
export async function syncNotesNow(userId: string): Promise<void> {
  await run(userId);
}

export function notesSyncStatus(userId: string): NotesSyncStatus {
  const conn = driveConnection(userId);
  const state = states.get(userId);
  return {
    connected: conn !== null,
    account: conn?.values.account ?? '',
    pending: conn ? countPendingSync(userId) + countPendingFolderSync(userId) : 0,
    lastError: state?.lastError ?? null,
    lastSyncedAt: state?.lastSyncedAt ?? null,
  };
}
