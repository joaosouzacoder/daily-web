import { ImapFlow, type FetchMessageObject, type ListResponse } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { applyMailPreset } from '@/lib/modules';
import { readable, sortFolders } from '@/lib/parsers/mail';
import { describeMailError } from './mailErrors';
import type { Connection } from '@/lib/vault/connections';
import type { EmailEnvelope, MailboxKind } from '@/lib/types';

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

/**
 * O que a conversa precisa: os Message-Ids que esta mensagem responde. Vem do
 * header References (o fio inteiro) mais o In-Reply-To (o degrau anterior),
 * que nem sempre aparece no References.
 *
 * O header chega como o bloco cru pedido no FETCH ("References: <a> <b>\r\n"),
 * podendo estar dobrado em várias linhas — daí a normalização do espaço.
 */
export function parseReferences(raw: Buffer | undefined, inReplyTo?: string): string[] {
  const texto = raw ? raw.toString('utf8') : '';
  const semRotulo = texto.replace(/^\s*references\s*:/i, '');
  const encontrados = semRotulo.match(/<[^<>\s]+>/g) ?? [];

  const todos = inReplyTo ? [...encontrados, inReplyTo] : encontrados;
  const vistos = new Set<string>();
  return todos.filter((id) => {
    const chave = id.trim().toLowerCase();
    if (!chave || vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

const UID_PATTERN = /^[0-9]+$/;

/** Quantos uids cabem num comando. O conjunto de sequência viaja numa única
 *  linha de protocolo, e servidores recusam linhas muito longas. */
const UIDS_PER_COMMAND = 200;

/**
 * Um uid vira parte de um conjunto de sequência IMAP ("2599,2600,2601"). Nessa
 * gramática `-` e `:` formam intervalo, então um valor fora de dígitos ali
 * atingiria mensagens que ninguém escolheu. Só dígitos entram.
 */
export function sequenceSets(uids: string[]): string[] {
  if (uids.length === 0) throw new Error('nenhuma mensagem informada');
  const invalido = uids.find((uid) => !UID_PATTERN.test(uid));
  if (invalido !== undefined) throw new Error('id de mensagem inválido');

  const blocos: string[] = [];
  for (let i = 0; i < uids.length; i += UIDS_PER_COMMAND) {
    blocos.push(uids.slice(i, i + UIDS_PER_COMMAND).join(','));
  }
  return blocos;
}

/** O caminho real da pasta, que muda por provedor e idioma ("[Gmail]/E-mails
 *  enviados"): é achado pela flag de uso especial, não pelo nome. */
async function mailboxPath(client: ImapFlow, mailbox: MailboxKind): Promise<string | null> {
  if (mailbox === 'inbox') return 'INBOX';
  return findSpecialUse(await client.list(), '\\Sent');
}

/**
 * As etiquetas que o usuário criou. Vêm misturadas com os rótulos de sistema
 * (`\Inbox`, `\Important`, `\Starred`), que não são etiquetas e não têm o que
 * fazer na lista; aqui a contrabarra inicial é o que separa uns dos outros.
 */
export function userLabels(labels: Set<string> | undefined): string[] {
  if (!labels) return [];
  return [...labels].filter((label) => !label.startsWith('\\')).sort();
}

function toEnvelope(
  message: FetchMessageObject,
  conn: Connection,
  mailbox: MailboxKind,
): EmailEnvelope {
  return {
    id: String(message.uid),
    account: conn.id,
    accountLabel: conn.label,
    from: addressLabel(message.envelope?.from?.[0]),
    subject: message.envelope?.subject ?? '',
    // O que você mandou nunca é novidade para você.
    unread: mailbox === 'sent' ? false : !message.flags?.has('\\Seen'),
    date: (message.envelope?.date ?? new Date()).toISOString(),
    messageId: message.envelope?.messageId ?? '',
    references: parseReferences(message.headers, message.envelope?.inReplyTo),
    labels: userLabels(message.labels),
    mailbox,
  };
}

async function listFrom(
  client: ImapFlow,
  conn: Connection,
  mailbox: MailboxKind,
  limit: number,
): Promise<EmailEnvelope[]> {
  const path = await mailboxPath(client, mailbox);
  if (!path) return [];

  const lock = await client.getMailboxLock(path);
  try {
    const total = typeof client.mailbox === 'object' ? client.mailbox.exists : 0;
    if (total === 0) return [];

    const first = Math.max(total - limit + 1, 1);
    const envelopes: EmailEnvelope[] = [];
    for await (const message of client.fetch(`${first}:*`, {
      uid: true,
      flags: true,
      envelope: true,
      // Sem pedir, a etiqueta não vem — e sem ela a lista só saberia das
      // etiquetas aplicadas na própria sessão. Servidor que não as reporta
      // devolve a mensagem sem `labels`, que vira lista vazia.
      labels: true,
      // O ENVELOPE traz o In-Reply-To, mas não o References — e é o
      // References que carrega o fio inteiro, não só o degrau anterior.
      headers: ['references'],
    })) {
      envelopes.push(toEnvelope(message, conn, mailbox));
    }
    return envelopes;
  } finally {
    lock.release();
  }
}

/**
 * A entrada e os enviados, numa conexão só. Sem os enviados, uma conversa
 * mostra só o lado de quem escreveu para você — as suas próprias respostas
 * ficam de fora e o fio parece um monólogo.
 *
 * Os enviados entram para compor conversa, não para virar linha na caixa: a
 * lista só mostra fios que têm ao menos uma mensagem recebida.
 */
export async function listEnvelopes(conn: Connection, limit: number): Promise<EmailEnvelope[]> {
  return withClient(conn, async (client) => {
    const inbox = await listFrom(client, conn, 'inbox', limit);
    // Uma pasta de enviados que não existe ou não abre não pode derrubar a
    // caixa de entrada: sem ela a conversa fica incompleta, sem a entrada não
    // há painel nenhum.
    const sent = await listFrom(client, conn, 'sent', limit).catch(() => []);
    return [...inbox, ...sent];
  });
}

/** O uid é por caixa: buscar um uid de enviados dentro da INBOX devolveria
 *  outra mensagem, não um erro. Por isso a caixa vem junto. */
export async function fetchBody(
  conn: Connection,
  uid: string,
  mailbox: MailboxKind = 'inbox',
): Promise<string> {
  return withClient(conn, async (client) => {
    const path = await mailboxPath(client, mailbox);
    if (!path) return '';
    const lock = await client.getMailboxLock(path);
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

// As operações de caixa recebem a lista inteira de uids e abrem uma conexão
// só. Uma conexão por mensagem faz o servidor recusar o lote inteiro com
// "too many simultaneous connections" — o IMAP opera sobre um conjunto de
// mensagens num comando, e é assim que ele quer ser usado.
export async function setSeen(conn: Connection, uids: string[], seen: boolean): Promise<void> {
  const blocos = sequenceSets(uids);
  await withClient(conn, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      for (const bloco of blocos) {
        if (seen) await client.messageFlagsAdd(bloco, ['\\Seen'], { uid: true });
        else await client.messageFlagsRemove(bloco, ['\\Seen'], { uid: true });
      }
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

export async function deleteEmails(conn: Connection, uids: string[]): Promise<void> {
  const blocos = sequenceSets(uids);
  await withClient(conn, async (client) => {
    const trash = findSpecialUse(await client.list(), '\\Trash');
    if (!trash) throw new Error('a conta não expõe uma pasta de lixeira');
    const lock = await client.getMailboxLock('INBOX');
    try {
      for (const bloco of blocos) await client.messageMove(bloco, trash, { uid: true });
    } finally {
      lock.release();
    }
  });
}

// No Gmail sobre IMAP uma etiqueta é uma pasta, e aplicar a etiqueta é copiar
// a mensagem para lá: ela continua na caixa de entrada e ganha mais um rótulo,
// que é exatamente a semântica de label. Em outros provedores o efeito é uma
// cópia na pasta escolhida, que é o mais próximo que o IMAP oferece.
export async function applyTag(conn: Connection, uids: string[], folder: string): Promise<void> {
  const blocos = sequenceSets(uids);
  await withClient(conn, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      for (const bloco of blocos) await client.messageCopy(bloco, folder, { uid: true });
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
  await setSeen(conn, [uid], true);
}

/** Abre a conexão e fecha, só para dizer se a credencial funciona. */
export async function testConnection(conn: Connection): Promise<void> {
  await withClient(conn, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    lock.release();
  });
}
