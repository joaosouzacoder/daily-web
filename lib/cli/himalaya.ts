import { runCli } from './run';
import {
  parseEnvelopes,
  sortRecentFirst,
  readable,
  parseMessageIdFromJson,
  stripMessageReadHeader,
  sortFolders,
} from '@/lib/parsers/himalaya';
import type { Account, EmailEnvelope } from '@/lib/types';

export async function listEnvelopes(account: Account, limit: number): Promise<EmailEnvelope[]> {
  const { stdout } = await runCli('himalaya', [
    'envelope', 'list', '-a', account, '--page-size', String(limit), '--json',
  ]);
  return sortRecentFirst(parseEnvelopes(stdout, account));
}

interface RawMailboxList {
  mailboxes?: { name: string }[];
}

export async function listFolders(account: Account): Promise<string[]> {
  const { stdout } = await runCli('himalaya', ['mailbox', 'list', '-a', account, '--json']);
  const raw: RawMailboxList = JSON.parse(stdout);
  return sortFolders((raw.mailboxes ?? []).map((f) => f.name));
}

export async function setSeen(account: Account, id: string, seen: boolean): Promise<void> {
  await runCli('himalaya', ['flag', seen ? 'add' : 'remove', id, '-f', 'seen', '-a', account]);
}

const DELETE_FOLDER = 'trash';

export async function moveTo(account: Account, id: string, folder: string): Promise<void> {
  await runCli('himalaya', ['message', 'move', '--to', folder, id, '-a', account]);
}

// No Gmail sobre IMAP, uma "etiqueta" é uma pasta e aplicar a etiqueta é
// copiar a mensagem para lá — ela continua na caixa de entrada, ganhando
// mais um rótulo, que é exatamente a semântica de label do Gmail.
export async function applyTag(account: Account, id: string, tag: string): Promise<void> {
  await runCli('himalaya', ['message', 'copy', '--to', tag, id, '-a', account]);
}

export async function deleteEmail(account: Account, id: string): Promise<void> {
  await moveTo(account, id, DELETE_FOLDER);
}

export async function fetchBody(account: Account, id: string): Promise<string> {
  const { stdout } = await runCli('himalaya', ['message', 'read', id, '-a', account]);
  return readable(stripMessageReadHeader(stdout));
}

export async function gmailUrl(account: Account, id: string): Promise<string | null> {
  const { stdout } = await runCli('himalaya', ['message', 'read', id, '-a', account, '--json']);
  const messageId = parseMessageIdFromJson(stdout);
  if (!messageId) return null;
  return `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(messageId)}`;
}

// `--body=<texto>` em vez de `--body <texto>`: a forma com "=" faz o clap
// tratar o valor como literal, então uma resposta que começa com "-" não é
// confundida com outra flag.
export async function sendReply(account: Account, id: string, body: string): Promise<void> {
  await runCli(
    'himalaya',
    ['message', 'reply', id, '-a', account, `--body=${body}`, '--send'],
    { timeoutMs: 60_000 },
  );
}
