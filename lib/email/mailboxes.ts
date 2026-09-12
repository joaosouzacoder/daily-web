import { getDb } from '@/lib/db';
import { listMailboxes } from '@/lib/integrations/imap';
import type { Connection } from '@/lib/vault/connections';
import type { MailboxNode } from '@/lib/types';

/**
 * A árvore de pastas da conta. Montá-la custa uma ida ao servidor por pasta
 * (a contagem de cada uma), então ela fica guardada e só é refeita quando
 * envelhece — o painel abre com o que já está no banco.
 */

/** Enquanto a árvore for mais nova do que isto, ela serve como está. Pasta
 *  nova e contagem aparecem no ciclo seguinte, que é a granularidade que o
 *  refresher já tem. */
const FRESH_FOR_MS = 10 * 60 * 1000;

interface Row {
  path: string;
  name: string;
  delimiter: string;
  parent: string | null;
  special_use: string | null;
  total: number;
  unread: number;
}

export function getStoredMailboxes(userId: string, account: string): MailboxNode[] {
  return (
    getDb()
      .prepare(
        `SELECT path, name, delimiter, parent, special_use, total, unread
         FROM email_mailboxes WHERE user_id = ? AND account = ? ORDER BY position`,
      )
      .all(userId, account) as Row[]
  ).map((row) => ({
    path: row.path,
    name: row.name,
    delimiter: row.delimiter,
    parent: row.parent,
    specialUse: row.special_use,
    total: row.total,
    unread: row.unread,
  }));
}

function storedAge(userId: string, account: string, now: Date): number {
  const row = getDb()
    .prepare(
      'SELECT MIN(synced_at) AS oldest FROM email_mailboxes WHERE user_id = ? AND account = ?',
    )
    .get(userId, account) as { oldest: string | null } | undefined;
  if (!row?.oldest) return Number.POSITIVE_INFINITY;
  return now.getTime() - new Date(row.oldest).getTime();
}

export function putMailboxes(
  userId: string,
  account: string,
  nodes: MailboxNode[],
  now: Date = new Date(),
): void {
  const db = getDb();
  const instante = now.toISOString();
  db.transaction(() => {
    // A pasta que sumiu do servidor sai daqui; as que continuam são
    // atualizadas no lugar, para não perderem o que já se sabe da numeração
    // delas — apagar e reinserir faria toda pasta voltar a ser lida do zero.
    const mantidos = nodes.map((n) => n.path);
    const marcadores = mantidos.map(() => '?').join(',');
    db.prepare(
      `DELETE FROM email_mailboxes
       WHERE user_id = ? AND account = ?
         ${mantidos.length > 0 ? `AND path NOT IN (${marcadores})` : ''}`,
    ).run(userId, account, ...mantidos);

    const upsert = db.prepare(
      `INSERT INTO email_mailboxes
         (user_id, account, path, name, delimiter, parent, special_use, total, unread, position, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, account, path)
       DO UPDATE SET name = excluded.name,
                     delimiter = excluded.delimiter,
                     parent = excluded.parent,
                     special_use = excluded.special_use,
                     total = excluded.total,
                     unread = excluded.unread,
                     position = excluded.position,
                     synced_at = excluded.synced_at`,
    );
    nodes.forEach((node, index) => {
      upsert.run(
        userId,
        account,
        node.path,
        node.name,
        node.delimiter,
        node.parent,
        node.specialUse,
        node.total,
        node.unread,
        index,
        instante,
      );
    });
  })();
}

/**
 * A árvore pronta para a tela. Vai ao servidor só quando não há nada guardado
 * ou quando o que há envelheceu; uma falha lá não apaga o que já existe, que
 * é melhor do que uma árvore vazia.
 */
export async function getMailboxes(
  userId: string,
  connection: Connection,
  now: Date = new Date(),
): Promise<MailboxNode[]> {
  const guardadas = getStoredMailboxes(userId, connection.id);
  if (guardadas.length > 0 && storedAge(userId, connection.id, now) < FRESH_FOR_MS) {
    return guardadas;
  }

  try {
    return (await syncMailboxes(userId, connection, now)).mailboxes;
  } catch (err) {
    if (guardadas.length > 0) return guardadas;
    throw err;
  }
}

/** Quando a árvore desta conta foi lida do servidor pela última vez. */
export function storedSyncedAt(userId: string, account: string): string | null {
  const row = getDb()
    .prepare(
      'SELECT MIN(synced_at) AS oldest FROM email_mailboxes WHERE user_id = ? AND account = ?',
    )
    .get(userId, account) as { oldest: string | null } | undefined;
  return row?.oldest ?? null;
}

export interface MailboxSync {
  mailboxes: MailboxNode[];
  /** Pastas que não existiam na última leitura. */
  added: string[];
  /** Pastas que sumiram do servidor. Uma pasta renomeada aparece aqui e em
   *  `added`: o IMAP não conta que houve renome, só o antes e o depois. */
  removed: string[];
}

// Duas aberturas do painel ao mesmo tempo pediriam a mesma árvore duas vezes,
// e cada pedido é uma ida ao servidor por pasta. Quem chega no meio de uma
// sincronização recebe o resultado da que já está em curso.
const SYNC_KEY = Symbol.for('daily-web.email.mailboxSync');
const emCurso: Map<string, Promise<MailboxSync>> = ((
  globalThis as Record<symbol, unknown>
)[SYNC_KEY] ??= new Map<string, Promise<MailboxSync>>()) as Map<string, Promise<MailboxSync>>;

/**
 * Lê a árvore do servidor e grava. Devolve o que mudou desde a última leitura,
 * para quem chamou saber se a tela precisa reagir a mais do que números.
 */
export function syncMailboxes(
  userId: string,
  connection: Connection,
  now: Date = new Date(),
): Promise<MailboxSync> {
  const chave = `${userId} ${connection.id}`;
  const jaEmCurso = emCurso.get(chave);
  if (jaEmCurso) return jaEmCurso;

  const promessa = (async () => {
    const antes = new Set(getStoredMailboxes(userId, connection.id).map((m) => m.path));
    const mailboxes = await listMailboxes(connection);
    putMailboxes(userId, connection.id, mailboxes, now);

    const depois = new Set(mailboxes.map((m) => m.path));
    return {
      mailboxes,
      added: [...depois].filter((p) => !antes.has(p)),
      removed: [...antes].filter((p) => !depois.has(p)),
    };
  })().finally(() => emCurso.delete(chave));

  emCurso.set(chave, promessa);
  return promessa;
}

export function resetMailboxSyncForTests(): void {
  emCurso.clear();
}

/** O caminho existe nesta conta? A pasta vem da tela, que é entrada não
 *  confiável: um caminho inventado abriria uma caixa que ninguém escolheu. */
export function isKnownMailbox(userId: string, account: string, path: string): boolean {
  const row = getDb()
    .prepare(
      'SELECT 1 AS present FROM email_mailboxes WHERE user_id = ? AND account = ? AND path = ?',
    )
    .get(userId, account, path) as { present: number } | undefined;
  return row !== undefined;
}

/** O número de validação da numeração de uid da pasta, como visto da última
 *  vez. Vazio enquanto a pasta nunca foi aberta. */
export function getMailboxUidValidity(userId: string, account: string, path: string): string {
  const row = getDb()
    .prepare(
      'SELECT uidvalidity FROM email_mailboxes WHERE user_id = ? AND account = ? AND path = ?',
    )
    .get(userId, account, path) as { uidvalidity: string } | undefined;
  return row?.uidvalidity ?? '';
}

export function setMailboxUidValidity(
  userId: string,
  account: string,
  path: string,
  uidvalidity: string,
): void {
  getDb()
    .prepare(
      'UPDATE email_mailboxes SET uidvalidity = ? WHERE user_id = ? AND account = ? AND path = ?',
    )
    .run(uidvalidity, userId, account, path);
}

/** O maior uid já lido desta pasta. Zero quando ela nunca foi lida — e é o
 *  que faz a primeira leitura buscar as recentes em vez de nada. */
export function getLastUid(userId: string, account: string, path: string): number {
  const row = getDb()
    .prepare('SELECT last_uid FROM email_mailboxes WHERE user_id = ? AND account = ? AND path = ?')
    .get(userId, account, path) as { last_uid: number } | undefined;
  return row?.last_uid ?? 0;
}

export function setFolderCursor(
  userId: string,
  account: string,
  path: string,
  uidvalidity: string,
  lastUid: number,
): void {
  getDb()
    .prepare(
      `UPDATE email_mailboxes SET uidvalidity = ?, last_uid = ?
       WHERE user_id = ? AND account = ? AND path = ?`,
    )
    .run(uidvalidity, lastUid, userId, account, path);
}

/** A pasta precisa existir aqui para guardar o que já se sabe da numeração
 *  dela. A entrada é lida antes de a árvore ser montada pela primeira vez. */
export function ensureMailboxRow(
  userId: string,
  account: string,
  path: string,
  now: Date = new Date(),
): void {
  getDb()
    .prepare(
      `INSERT INTO email_mailboxes
         (user_id, account, path, name, delimiter, parent, special_use, total, unread, position, synced_at)
       VALUES (?, ?, ?, ?, '/', NULL, NULL, 0, 0, 0, ?)
       ON CONFLICT (user_id, account, path) DO NOTHING`,
    )
    .run(userId, account, path, path, now.toISOString());
}
