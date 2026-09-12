import { getDb } from '@/lib/db';
import type { EmailEnvelope, MailboxKind } from '@/lib/types';

/**
 * As mensagens que já foram lidas do servidor. Guardá-las é o que permite
 * pedir só o que chegou desde o último uid conhecido: sem isto, todo ciclo
 * relia a caixa inteira para descobrir que nada tinha mudado.
 */

interface Row {
  account: string;
  account_label: string;
  folder: string;
  uid: number;
  mailbox: string;
  sender: string;
  subject: string;
  unread: number;
  date: string;
  message_id: string;
  refs: string;
  labels: string;
}

function toEnvelope(row: Row): EmailEnvelope {
  return {
    id: String(row.uid),
    account: row.account,
    accountLabel: row.account_label,
    from: row.sender,
    subject: row.subject,
    unread: row.unread === 1,
    date: row.date,
    messageId: row.message_id,
    references: row.refs ? (JSON.parse(row.refs) as string[]) : [],
    labels: row.labels ? (JSON.parse(row.labels) as string[]) : [],
    mailbox: row.mailbox as MailboxKind,
    folder: row.folder,
  };
}

export function putMessages(
  userId: string,
  uidvalidity: string,
  envelopes: EmailEnvelope[],
): void {
  if (envelopes.length === 0) return;
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO email_messages
       (user_id, account, folder, uidvalidity, uid, mailbox, account_label,
        sender, subject, unread, date, message_id, refs, labels)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, account, folder, uidvalidity, uid)
     DO UPDATE SET unread = excluded.unread,
                   labels = excluded.labels,
                   subject = excluded.subject,
                   sender = excluded.sender,
                   date = excluded.date`,
  );
  db.transaction(() => {
    for (const e of envelopes) {
      insert.run(
        userId,
        e.account,
        e.folder,
        uidvalidity,
        Number(e.id),
        e.mailbox,
        e.accountLabel,
        e.from,
        e.subject,
        e.unread ? 1 : 0,
        e.date,
        e.messageId,
        JSON.stringify(e.references),
        JSON.stringify(e.labels),
      );
    }
  })();
}

export interface FlagUpdate {
  uid: string;
  unread: boolean;
  labels: string[];
}

/**
 * Aplica o que a janela recente disse sobre cada mensagem, e tira as que não
 * vieram nela — no servidor elas foram apagadas ou movidas. Só dentro da
 * janela: fora dela ninguém perguntou, e ausência ali não é evidência.
 *
 * `present` é o conjunto que o servidor confirmou existir na janela. Ele vem
 * separado das flags porque a mensagem recém-trazida também está lá, e tomá-la
 * por ausente apagaria o que acabou de chegar.
 */
export function applyFlagWindow(
  userId: string,
  account: string,
  folder: string,
  uidvalidity: string,
  windowFrom: number,
  flags: FlagUpdate[],
  present: number[],
): void {
  const db = getDb();
  const update = db.prepare(
    `UPDATE email_messages SET unread = ?, labels = ?
     WHERE user_id = ? AND account = ? AND folder = ? AND uidvalidity = ? AND uid = ?`,
  );
  db.transaction(() => {
    for (const flag of flags) {
      update.run(
        flag.unread ? 1 : 0,
        JSON.stringify(flag.labels),
        userId,
        account,
        folder,
        uidvalidity,
        Number(flag.uid),
      );
    }

    const presentes = [...new Set(present)];
    const marcadores = presentes.map(() => '?').join(',');
    db.prepare(
      `DELETE FROM email_messages
       WHERE user_id = ? AND account = ? AND folder = ? AND uidvalidity = ? AND uid >= ?
         ${presentes.length > 0 ? `AND uid NOT IN (${marcadores})` : ''}`,
    ).run(userId, account, folder, uidvalidity, windowFrom, ...presentes);
  })();
}

/** O que a reindexação do servidor invalidou: os uids guardados passaram a
 *  apontar para outras mensagens e não servem mais para nada. */
export function dropFolderMessages(userId: string, account: string, folder: string): void {
  getDb()
    .prepare('DELETE FROM email_messages WHERE user_id = ? AND account = ? AND folder = ?')
    .run(userId, account, folder);
}

export function listStoredMessages(
  userId: string,
  account: string,
  folder: string,
  uidvalidity: string,
  limit: number,
): EmailEnvelope[] {
  return (
    getDb()
      .prepare(
        `SELECT * FROM email_messages
         WHERE user_id = ? AND account = ? AND folder = ? AND uidvalidity = ?
         ORDER BY date DESC, uid DESC
         LIMIT ?`,
      )
      .all(userId, account, folder, uidvalidity, limit) as Row[]
  ).map(toEnvelope);
}

/** Mantém a pasta no tamanho de uma tela: o que passa do teto sai do banco,
 *  para o armazenamento não crescer sem fim junto com a caixa. */
export function pruneFolder(
  userId: string,
  account: string,
  folder: string,
  uidvalidity: string,
  keep: number,
): number {
  return getDb()
    .prepare(
      `DELETE FROM email_messages
       WHERE user_id = ? AND account = ? AND folder = ? AND uidvalidity = ?
         AND uid NOT IN (
           SELECT uid FROM email_messages
           WHERE user_id = ? AND account = ? AND folder = ? AND uidvalidity = ?
           ORDER BY uid DESC LIMIT ?
         )`,
    )
    .run(userId, account, folder, uidvalidity, userId, account, folder, uidvalidity, keep).changes;
}

/** Uma mensagem guardada, pelo par que a identifica. Nula quando a pasta ainda
 *  não foi sincronizada ou a mensagem saiu dela. */
export function getStoredMessage(
  userId: string,
  account: string,
  folder: string,
  uidvalidity: string,
  uid: string,
): EmailEnvelope | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM email_messages
       WHERE user_id = ? AND account = ? AND folder = ? AND uidvalidity = ? AND uid = ?`,
    )
    .get(userId, account, folder, uidvalidity, Number(uid)) as Row | undefined;
  return row ? toEnvelope(row) : null;
}
