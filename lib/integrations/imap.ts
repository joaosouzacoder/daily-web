import { ImapFlow, type FetchMessageObject, type ListResponse } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { applyMailPreset } from '@/lib/modules';
import { readable, sortFolders } from '@/lib/parsers/mail';
import { describeMailError } from './mailErrors';
import { runExclusive } from '@/lib/email/queue';
import type { Connection } from '@/lib/vault/connections';
import type { EmailEnvelope, MailboxKind, MailboxNode } from '@/lib/types';

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

// Toda ida ao servidor passa pela fila da conta. A listagem segura a conexão
// por segundos, e uma ação disparada nesse meio-tempo abria um segundo login:
// o provedor recusa o excedente, a ação falhava e a mensagem voltava à tela.
async function withClient<T>(conn: Connection, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  return runExclusive(conn.id, () => connectAndRun(conn, fn));
}

async function connectAndRun<T>(conn: Connection, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
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

  // Um socket que cai fora de um comando emite `error` no cliente, sem
  // promessa para carregar a falha: sem ouvinte isso sobe como
  // uncaughtException e derruba o processo inteiro por causa de uma caixa.
  client.on('error', () => {});

  try {
    await client.connect();
    return await fn(client);
  } catch (err) {
    throw new Error(`${conn.label}: ${describeMailError(err)}`);
  } finally {
    // `logout` fala IMAP com um servidor que pode já ter sumido, e nesse caso
    // rejeita. Derrubar o socket é o fallback para não vazar conexão; nenhum
    // dos dois pode substituir o erro real que está subindo daqui.
    try {
      await client.logout();
    } catch {
      // Encerramento sujo não é o defeito que interessa a quem chamou.
    }
    try {
      client.close();
    } catch {
      // Idem: o socket já pode ter ido embora sozinho.
    }
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
  folder: string,
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
    folder,
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
  return listPath(client, conn, path, mailbox, limit);
}

async function listPath(
  client: ImapFlow,
  conn: Connection,
  path: string,
  mailbox: MailboxKind,
  limit: number,
): Promise<EmailEnvelope[]> {
  const lock = await client.getMailboxLock(path);
  try {
    const total = typeof client.mailbox === 'object' ? client.mailbox.exists : 0;
    if (total === 0) return [];
    return await fetchRecent(client, conn, path, mailbox, total, limit);
  } finally {
    lock.release();
  }
}

/** As `limit` mensagens mais recentes da pasta já aberta. O conjunto é de
 *  números de sequência, então o teto vale sempre — nada de caixa inteira. */
async function fetchRecent(
  client: ImapFlow,
  conn: Connection,
  path: string,
  mailbox: MailboxKind,
  total: number,
  limit: number,
): Promise<EmailEnvelope[]> {
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
    envelopes.push(toEnvelope(message, conn, mailbox, path));
  }
  return envelopes;
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
      return await bodyOf(client, uid);
    } finally {
      lock.release();
    }
  });
}

async function bodyOf(client: ImapFlow, uid: string): Promise<string> {
  const message = await client.fetchOne(uid, { source: true }, { uid: true });
  if (!message || !message.source) return '';
  const parsed = await simpleParser(message.source);
  // O text/plain é o que o remetente escreveu para ser lido; só caímos no
  // HTML — que `readable` ainda precisa limpar — quando ele não existe.
  if (parsed.text?.trim()) return readable(parsed.text);
  return parsed.html ? readable(parsed.html) : '';
}

export interface BodyRequest {
  uid: string;
  mailbox: MailboxKind;
}

export interface FetchedBody extends BodyRequest {
  body: string;
}

const MAILBOX_ORDER: MailboxKind[] = ['inbox', 'sent'];

/**
 * Vários corpos numa conexão só, agrupados por caixa para abrir cada uma uma
 * única vez. Uma conexão por mensagem faz o servidor recusar os logins
 * seguintes — a mesma razão que já obriga as operações de caixa a receberem o
 * lote inteiro de uids.
 *
 * Uma mensagem que falha sai do resultado sem levar as outras junto: quem
 * chama guarda o que veio e tenta o resto depois.
 */
export async function fetchBodies(
  conn: Connection,
  requests: BodyRequest[],
): Promise<FetchedBody[]> {
  if (requests.length === 0) return [];

  return withClient(conn, async (client) => {
    const fetched: FetchedBody[] = [];

    for (const mailbox of MAILBOX_ORDER) {
      const daCaixa = requests.filter((r) => r.mailbox === mailbox);
      if (daCaixa.length === 0) continue;

      const path = await mailboxPath(client, mailbox);
      if (!path) continue;

      const lock = await client.getMailboxLock(path);
      try {
        for (const { uid } of daCaixa) {
          try {
            fetched.push({ uid, mailbox, body: await bodyOf(client, uid) });
          } catch {
            // Mensagem apagada entre a listagem e agora, ou ilegível: o
            // aquecimento tenta de novo no ciclo seguinte.
          }
        }
      } finally {
        lock.release();
      }
    }

    return fetched;
  });
}

// As operações de caixa recebem a lista inteira de uids e abrem uma conexão
// só. Uma conexão por mensagem faz o servidor recusar o lote inteiro com
// "too many simultaneous connections" — o IMAP opera sobre um conjunto de
// mensagens num comando, e é assim que ele quer ser usado.
export async function setSeen(
  conn: Connection,
  uids: string[],
  seen: boolean,
  mailbox: string = INBOX_PATH,
): Promise<void> {
  const blocos = sequenceSets(uids);
  await withClient(conn, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
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

export async function deleteEmails(
  conn: Connection,
  uids: string[],
  mailbox: string = INBOX_PATH,
): Promise<void> {
  const blocos = sequenceSets(uids);
  await withClient(conn, async (client) => {
    const trash = findSpecialUse(await client.list(), '\\Trash');
    if (!trash) throw new Error('a conta não expõe uma pasta de lixeira');
    // Apagar o que já está na lixeira não tem para onde mover.
    if (trash === mailbox) throw new Error('a mensagem já está na lixeira');
    const lock = await client.getMailboxLock(mailbox);
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
export async function applyTag(
  conn: Connection,
  uids: string[],
  folder: string,
  mailbox: string = INBOX_PATH,
): Promise<void> {
  const blocos = sequenceSets(uids);
  await withClient(conn, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      for (const bloco of blocos) await client.messageCopy(bloco, folder, { uid: true });
    } finally {
      lock.release();
    }
  });
}

export const INBOX_PATH = 'INBOX';

/** Teto de pastas. Uma conta com milhares de etiquetas faria uma consulta de
 *  contagem por pasta e seguraria a conexão por minutos. */
const MAX_MAILBOXES = 300;

/**
 * A árvore de pastas com o que cada uma tem dentro. `status` é um comando por
 * pasta, mas todos correm na mesma conexão, que já é serializada por conta.
 * Uma pasta cuja contagem falha entra sem números em vez de derrubar a árvore.
 */
export async function listMailboxes(conn: Connection): Promise<MailboxNode[]> {
  return withClient(conn, async (client) => {
    const caixas = (await client.list())
      .filter((box) => !box.flags?.has('\\Noselect'))
      .slice(0, MAX_MAILBOXES);

    const nodes: MailboxNode[] = [];
    for (const box of caixas) {
      let total = 0;
      let unread = 0;
      try {
        const status = await client.status(box.path, { messages: true, unseen: true });
        total = status.messages ?? 0;
        unread = status.unseen ?? 0;
      } catch {
        // Pasta que não aceita STATUS entra sem contagem: melhor uma árvore
        // completa com um número faltando do que nenhuma árvore.
      }
      nodes.push({
        path: box.path,
        name: box.name,
        delimiter: box.delimiter ?? '/',
        parent: box.parentPath || null,
        specialUse: box.specialUse ?? null,
        total,
        unread,
      });
    }
    return sortMailboxes(nodes);
  });
}

/** A entrada primeiro, depois as pastas de sistema, depois o resto em ordem
 *  alfabética — a ordem que todo cliente de e-mail mostra. */
const SPECIAL_ORDER = ['\\Sent', '\\Drafts', '\\Junk', '\\Trash', '\\Archive'];

export function sortMailboxes(nodes: MailboxNode[]): MailboxNode[] {
  const peso = (node: MailboxNode): number => {
    if (node.path.toUpperCase() === INBOX_PATH) return 0;
    const especial = node.specialUse ? SPECIAL_ORDER.indexOf(node.specialUse) : -1;
    return especial >= 0 ? 1 + especial : 100;
  };
  return [...nodes].sort(
    (a, b) => peso(a) - peso(b) || a.path.localeCompare(b.path, 'pt-BR'),
  );
}

export interface FolderPage {
  envelopes: EmailEnvelope[];
  /** Identifica a numeração de uid desta pasta. Se ele mudar, todo uid
   *  guardado antes passou a apontar para outra mensagem. */
  uidvalidity: string;
  total: number;
}

/** As mensagens de uma pasta qualquer, as mais recentes primeiro. */
export async function listFolder(
  conn: Connection,
  path: string,
  limit: number,
): Promise<FolderPage> {
  return withClient(conn, async (client) => {
    // O que você mandou nunca é novidade para você — e isso vale para a pasta
    // de enviados de verdade, encontrada pela flag, não pelo nome.
    const enviados = findSpecialUse(await client.list(), '\\Sent');
    const kind: MailboxKind = path === enviados ? 'sent' : 'inbox';

    const lock = await client.getMailboxLock(path);
    try {
      const caixa = typeof client.mailbox === 'object' ? client.mailbox : null;
      const uidvalidity = caixa?.uidValidity !== undefined ? String(caixa.uidValidity) : '';
      const total = caixa?.exists ?? 0;
      const envelopes = total === 0 ? [] : await fetchRecent(client, conn, path, kind, total, limit);
      return { envelopes, uidvalidity, total };
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
