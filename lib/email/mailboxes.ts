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
    // A pasta que o usuário apagou no servidor não pode sobrar aqui: a árvore
    // é substituída inteira, não acrescentada.
    db.prepare('DELETE FROM email_mailboxes WHERE user_id = ? AND account = ?').run(
      userId,
      account,
    );
    const insert = db.prepare(
      `INSERT INTO email_mailboxes
         (user_id, account, path, name, delimiter, parent, special_use, total, unread, position, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    nodes.forEach((node, index) => {
      insert.run(
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
    const nodes = await listMailboxes(connection);
    putMailboxes(userId, connection.id, nodes, now);
    return nodes;
  } catch (err) {
    if (guardadas.length > 0) return guardadas;
    throw err;
  }
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
