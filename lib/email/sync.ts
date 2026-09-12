import { fetchFolderChanges } from '@/lib/integrations/imap';
import type { Connection } from '@/lib/vault/connections';
import type { EmailEnvelope } from '@/lib/types';
import {
  ensureMailboxRow,
  getLastUid,
  getMailboxUidValidity,
  setFolderCursor,
  setMailboxUidValidity,
} from './mailboxes';
import {
  applyFlagWindow,
  dropFolderMessages,
  listStoredMessages,
  pruneFolder,
  putMessages,
} from './messages';
import { invalidateForUidValidity } from './pendingActions';

/**
 * Traz para o banco o que mudou na pasta desde a última vez, e devolve a
 * pasta como ela está agora.
 *
 * O ciclo anterior relia a caixa inteira a cada dez minutos para descobrir,
 * quase sempre, que nada tinha mudado. Aqui são dois comandos numa conexão:
 * o que chegou depois do último uid, e as flags da janela recente.
 */

/** Quantas mensagens a primeira leitura de uma pasta traz. */
const INITIAL_LIMIT = 50;

/** Largura da janela de reconferência, em uids. Ela cobre o que pode ter sido
 *  lido, etiquetado ou apagado por outro cliente; o que é mais antigo do que
 *  isso não é perguntado, e por isso também não é concluído. */
const FLAG_WINDOW = 200;

/** Teto do que fica guardado por pasta. Uma caixa com anos de mensagem não
 *  cabe no banco nem serve para a tela. */
const KEEP_PER_FOLDER = 300;

export interface SyncResult {
  envelopes: EmailEnvelope[];
  uidvalidity: string;
  /** Quantas chegaram desde a última vez. Zero é o caso comum e é o que faz
   *  esta sincronização valer a pena. */
  added: number;
  /** A numeração da pasta foi reiniciada pelo servidor e tudo que havia sido
   *  guardado dela precisou ser relido. */
  reindexed: boolean;
}

export async function syncFolder(
  userId: string,
  connection: Connection,
  folder: string,
  limit: number = INITIAL_LIMIT,
): Promise<SyncResult> {
  ensureMailboxRow(userId, connection.id, folder);
  const conhecido = getMailboxUidValidity(userId, connection.id, folder);
  const ultimoUid = getLastUid(userId, connection.id, folder);

  const mudancas = await fetchFolderChanges(
    connection,
    folder,
    conhecido && ultimoUid > 0 ? String(ultimoUid) : null,
    FLAG_WINDOW,
    limit,
  );

  // Numeração reiniciada: todo uid guardado passou a apontar para outra
  // mensagem. O que havia é descartado e a pasta é lida de novo, e as ações
  // que ainda dependiam daqueles números falham à vista.
  const reindexed = conhecido !== '' && mudancas.uidvalidity !== conhecido;
  if (reindexed) {
    dropFolderMessages(userId, connection.id, folder);
    invalidateForUidValidity(userId, connection.id, folder, mudancas.uidvalidity);
    return recarregar(userId, connection, folder, limit);
  }

  putMessages(userId, mudancas.uidvalidity, mudancas.added);
  applyFlagWindow(
    userId,
    connection.id,
    folder,
    mudancas.uidvalidity,
    Number(mudancas.windowFrom),
    mudancas.flags,
    [
      ...mudancas.flags.map((f) => Number(f.uid)),
      ...mudancas.added.map((e) => Number(e.id)),
    ],
  );
  pruneFolder(userId, connection.id, folder, mudancas.uidvalidity, KEEP_PER_FOLDER);

  const maiorUid = mudancas.added.reduce((maior, e) => Math.max(maior, Number(e.id)), ultimoUid);
  setMailboxUidValidity(userId, connection.id, folder, mudancas.uidvalidity);
  setFolderCursor(userId, connection.id, folder, mudancas.uidvalidity, maiorUid);

  return {
    envelopes: listStoredMessages(userId, connection.id, folder, mudancas.uidvalidity, limit),
    uidvalidity: mudancas.uidvalidity,
    added: mudancas.added.length,
    reindexed: false,
  };
}

/** Lê a pasta do zero. Só acontece na primeira vez e depois de uma
 *  reindexação — não é o caminho de todo ciclo. */
async function recarregar(
  userId: string,
  connection: Connection,
  folder: string,
  limit: number,
): Promise<SyncResult> {
  const mudancas = await fetchFolderChanges(connection, folder, null, FLAG_WINDOW, limit);
  putMessages(userId, mudancas.uidvalidity, mudancas.added);
  const maiorUid = mudancas.added.reduce((maior, e) => Math.max(maior, Number(e.id)), 0);
  setMailboxUidValidity(userId, connection.id, folder, mudancas.uidvalidity);
  setFolderCursor(userId, connection.id, folder, mudancas.uidvalidity, maiorUid);

  return {
    envelopes: listStoredMessages(userId, connection.id, folder, mudancas.uidvalidity, limit),
    uidvalidity: mudancas.uidvalidity,
    added: mudancas.added.length,
    reindexed: true,
  };
}
