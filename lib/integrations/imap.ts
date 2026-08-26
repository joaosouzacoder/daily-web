import { ImapFlow, type ListResponse } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { applyMailPreset } from '@/lib/modules';
import { readable, sortFolders } from '@/lib/parsers/mail';
import { describeMailError } from './mailErrors';
import type { Connection } from '@/lib/vault/connections';
import type { EmailEnvelope } from '@/lib/types';

export interface MailConfig {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  user: string;
  password: string;
}

const CONNECT_TIMEOUT_MS = 20_000;

export function mailConfig(conn: Connection): MailConfig {
  const values = applyMailPreset(conn.values);
  const imapHost = (values.imapHost ?? '').trim();
  if (!imapHost) throw new Error(`conta ${conn.label}: servidor IMAP não configurado`);

  return {
    imapHost,
    imapPort: Number(values.imapPort || 993),
    smtpHost: (values.smtpHost ?? '').trim(),
    smtpPort: Number(values.smtpPort || 465),
    user: (values.user ?? '').trim(),
    password: values.password ?? '',
  };
}

async function withClient<T>(conn: Connection, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const config = mailConfig(conn);
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapPort === 993,
    auth: { user: config.user, pass: config.password },
    logger: false,
    // Sem isto uma caixa fora do ar segura o ciclo do refresher inteiro.
    socketTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
    connectionTimeout: CONNECT_TIMEOUT_MS,
  });

  try {
    await client.connect();
    return await fn(client);
  } catch (err) {
    throw new Error(`${conn.label}: ${describeMailError(err)}`);
  } finally {
    // `logout` fala IMAP com um servidor que pode já ter sumido; derrubar o
    // socket é o fallback para não vazar conexão nem mascarar o erro real.
    await client.logout().catch(() => client.close());
  }
}

function addressLabel(from: { name?: string; address?: string } | undefined): string {
  if (!from) return '';
  return from.name?.trim() ? from.name.trim() : (from.address ?? '');
}

export async function listEnvelopes(conn: Connection, limit: number): Promise<EmailEnvelope[]> {
  return withClient(conn, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const total = typeof client.mailbox === 'object' ? client.mailbox.exists : 0;
      if (total === 0) return [];

      const first = Math.max(total - limit + 1, 1);
      const envelopes: EmailEnvelope[] = [];
      for await (const message of client.fetch(`${first}:*`, {
        uid: true,
        flags: true,
        envelope: true,
      })) {
        envelopes.push({
          id: String(message.uid),
          account: conn.id,
          accountLabel: conn.label,
          from: addressLabel(message.envelope?.from?.[0]),
          subject: message.envelope?.subject ?? '',
          unread: !message.flags?.has('\\Seen'),
          date: (message.envelope?.date ?? new Date()).toISOString(),
          messageId: message.envelope?.messageId ?? '',
        });
      }
      return envelopes;
    } finally {
      lock.release();
    }
  });
}

export async function fetchBody(conn: Connection, uid: string): Promise<string> {
  return withClient(conn, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const message = await client.fetchOne(uid, { source: true }, { uid: true });
      if (!message || !message.source) return '';
      const parsed = await simpleParser(message.source);
      // O text/plain é o que o remetente escreveu para ser lido; só caímos no
      // HTML — que `readable` ainda precisa limpar — quando ele não existe.
      if (parsed.text?.trim()) return readable(parsed.text);
      return parsed.html ? readable(parsed.html) : '';
    } finally {
      lock.release();
    }
  });
}

export async function setSeen(conn: Connection, uid: string, seen: boolean): Promise<void> {
  await withClient(conn, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      if (seen) await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
      else await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
  });
}

/** Pastas em que dá para arquivar ou etiquetar. As de sistema (rascunhos,
 *  enviados) ficam de fora: mover um e-mail recebido para lá não faz sentido. */
const HIDDEN_SPECIAL_USE = ['\\Drafts', '\\Sent', '\\Junk', '\\Trash'];

export function usableFolders(list: ListResponse[]): string[] {
  const names = list
    .filter((box) => !box.flags?.has('\\Noselect'))
    .filter((box) => !HIDDEN_SPECIAL_USE.includes(box.specialUse ?? ''))
    .map((box) => box.path);
  return sortFolders(names);
}

export async function listFolders(conn: Connection): Promise<string[]> {
  return withClient(conn, async (client) => usableFolders(await client.list()));
}

/** O nome da lixeira muda por provedor e por idioma (`[Gmail]/Lixeira`), então
 *  ela é encontrada pela flag de uso especial, não pelo nome. */
export function findSpecialUse(list: ListResponse[], use: string): string | null {
  return list.find((box) => box.specialUse === use)?.path ?? null;
}

export async function deleteEmail(conn: Connection, uid: string): Promise<void> {
  await withClient(conn, async (client) => {
    const trash = findSpecialUse(await client.list(), '\\Trash');
    if (!trash) throw new Error('a conta não expõe uma pasta de lixeira');
    const lock = await client.getMailboxLock('INBOX');
    try {
      await client.messageMove(uid, trash, { uid: true });
    } finally {
      lock.release();
    }
  });
}

// No Gmail sobre IMAP uma etiqueta é uma pasta, e aplicar a etiqueta é copiar
// a mensagem para lá: ela continua na caixa de entrada e ganha mais um rótulo,
// que é exatamente a semântica de label. Em outros provedores o efeito é uma
// cópia na pasta escolhida, que é o mais próximo que o IMAP oferece.
export async function applyTag(conn: Connection, uid: string, folder: string): Promise<void> {
  await withClient(conn, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      await client.messageCopy(uid, folder, { uid: true });
    } finally {
      lock.release();
    }
  });
}

export interface ReplyTarget {
  to: string;
  subject: string;
  messageId: string;
  references: string;
}

export async function replyTarget(conn: Connection, uid: string): Promise<ReplyTarget> {
  return withClient(conn, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const message = await client.fetchOne(uid, { envelope: true }, { uid: true });
      const envelope = message ? message.envelope : undefined;
      const replyTo = envelope?.replyTo?.[0] ?? envelope?.from?.[0];
      if (!replyTo?.address) throw new Error('a mensagem não tem remetente para responder');

      const subject = envelope?.subject ?? '';
      return {
        to: replyTo.address,
        subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
        messageId: envelope?.messageId ?? '',
        references: [envelope?.inReplyTo, envelope?.messageId].filter(Boolean).join(' '),
      };
    } finally {
      lock.release();
    }
  });
}

export async function sendReply(conn: Connection, uid: string, body: string): Promise<void> {
  const config = mailConfig(conn);
  if (!config.smtpHost) throw new Error(`conta ${conn.label}: servidor SMTP não configurado`);

  const target = await replyTarget(conn, uid);
  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    // 465 é TLS desde o começo; 587 abre em claro e sobe para TLS com STARTTLS.
    secure: config.smtpPort === 465,
    auth: { user: config.user, pass: config.password },
  });

  try {
    await transport.sendMail({
      from: config.user,
      to: target.to,
      subject: target.subject,
      text: body,
      inReplyTo: target.messageId || undefined,
      references: target.references || undefined,
    });
  } catch (err) {
    throw new Error(`${conn.label}: ${describeMailError(err)}`);
  } finally {
    transport.close();
  }
  await setSeen(conn, uid, true);
}

/** Abre a conexão e fecha, só para dizer se a credencial funciona. */
export async function testConnection(conn: Connection): Promise<void> {
  await withClient(conn, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    lock.release();
  });
}
