import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('@/lib/integrations/imap', () => ({
  listMailboxes: vi.fn(),
  fetchFolderChanges: vi.fn(),
  setSeen: vi.fn(),
  applyTag: vi.fn(),
  moveEmails: vi.fn(),
  markFolderRead: vi.fn(),
  deleteEmails: vi.fn(),
}));

const currentUser = vi.fn();
vi.mock('@/lib/auth/currentUser', () => ({ getCurrentUser: () => currentUser() }));

import {
  listMailboxes,
  fetchFolderChanges,
  moveEmails,
  markFolderRead,
} from '@/lib/integrations/imap';
import { GET as mailboxesRoute } from '@/app/api/email/mailboxes/route';
import { GET as messagesRoute } from '@/app/api/email/messages/route';
import { POST as batchRoute } from '@/app/api/email/batch/route';
import { POST as folderReadRoute } from '@/app/api/email/folder/read/route';
import type { MailboxNode } from '@/lib/types';

const ME = { id: 'u-1', username: 'joao', passwordHash: 'x', isAdmin: true, createdAt: '' };

let dir: string;
let mailId: string;

const ARVORE: MailboxNode[] = [
  { path: 'INBOX', name: 'INBOX', delimiter: '/', parent: null, specialUse: null, total: 12, unread: 3 },
  { path: 'Clientes', name: 'Clientes', delimiter: '/', parent: null, specialUse: null, total: 5, unread: 4 },
  { path: 'Arquivo', name: 'Arquivo', delimiter: '/', parent: null, specialUse: null, total: 2, unread: 0 },
];

function envelope(uid: string, over: Record<string, unknown> = {}) {
  return {
    id: uid,
    account: mailId,
    accountLabel: 'Trabalho',
    from: 'Alguém',
    subject: `Assunto ${uid}`,
    unread: true,
    date: `2026-09-${uid.padStart(2, '0')}T10:00:00Z`,
    messageId: `<${uid}@b>`,
    references: [],
    labels: [],
    mailbox: 'inbox' as const,
    folder: 'Clientes',
    ...over,
  };
}

function get(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/email?${query}`);
}

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api', { method: 'POST', body: JSON.stringify(body) });
}

async function mensagensDaPasta() {
  const res = await messagesRoute(get(`account=${mailId}&folder=Clientes`));
  return (await res.json()).messages as { id: string; unread: boolean; actionError?: string }[];
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-folder-actions-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  process.env.DAILY_WEB_SECRET_KEY = Buffer.alloc(32, 13).toString('base64');
  vi.clearAllMocks();
  currentUser.mockResolvedValue(ME);

  const { getDb } = await import('@/lib/db');
  getDb();
  const { saveConnection } = await import('@/lib/vault/connections');
  mailId = saveConnection(ME.id, 'email', 'Trabalho', {
    preset: 'gmail',
    user: 'a@x.com',
    password: 's',
  });

  vi.mocked(listMailboxes).mockResolvedValue(ARVORE);
  vi.mocked(fetchFolderChanges).mockResolvedValue({
    uidvalidity: '100',
    added: [envelope('1'), envelope('2'), envelope('3')] as never,
    flags: [
      { uid: '1', unread: true, labels: [] },
      { uid: '2', unread: true, labels: [] },
      { uid: '3', unread: true, labels: [] },
    ],
    windowFrom: '1',
    total: 3,
  });
  vi.mocked(moveEmails).mockResolvedValue(undefined);
  vi.mocked(markFolderRead).mockResolvedValue(3);

  // A árvore precisa existir: só um caminho que o servidor declarou é aceito.
  await mailboxesRoute(get(`account=${mailId}`));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('marcar a pasta inteira como lida', () => {
  // Uma ação por mensagem seria uma linha por mensagem no registro e uma
  // conexão por lote no servidor. A pasta é uma ação só.
  it('grava uma única intenção para a pasta', async () => {
    const res = await folderReadRoute(post({ account: mailId, folder: 'Clientes' }));
    expect(res.status).toBe(200);

    const { listPendingActions } = await import('@/lib/email/pendingActions');
    const pendentes = listPendingActions(ME.id);
    expect(pendentes).toHaveLength(1);
    expect(pendentes[0]).toMatchObject({ kind: 'read_folder', mailbox: 'Clientes', uid: '' });
  });

  it('usa um comando só no servidor, não um por mensagem', async () => {
    await folderReadRoute(post({ account: mailId, folder: 'Clientes' }));
    expect(markFolderRead).toHaveBeenCalledTimes(1);
    expect(vi.mocked(markFolderRead).mock.calls[0][1]).toBe('Clientes');
  });

  // Enquanto a intenção não é confirmada, o retrato do servidor ainda traz
  // tudo como não lido — e ele não pode desfazer o que foi pedido.
  it('mostra a pasta lida antes de o servidor concordar', async () => {
    await folderReadRoute(post({ account: mailId, folder: 'Clientes' }));

    const mensagens = await mensagensDaPasta();
    expect(mensagens).toHaveLength(3);
    expect(mensagens.every((m) => !m.unread)).toBe(true);
  });

  it('esquece a intenção quando a pasta não tem mais não lidas', async () => {
    // A pasta precisa ter sido lida uma vez: um retrato vazio não confirma
    // nada, porque dele não se conclui que não sobrou não lida.
    await mensagensDaPasta();
    await folderReadRoute(post({ account: mailId, folder: 'Clientes' }));

    vi.mocked(fetchFolderChanges).mockResolvedValue({
      uidvalidity: '100',
      added: [],
      flags: [
        { uid: '1', unread: false, labels: [] },
        { uid: '2', unread: false, labels: [] },
        { uid: '3', unread: false, labels: [] },
      ],
      windowFrom: '1',
      total: 3,
    } as never);
    await mensagensDaPasta();

    const { listPendingActions } = await import('@/lib/email/pendingActions');
    expect(listPendingActions(ME.id)).toEqual([]);
  });

  // Nada sem limite: uma pasta com dezenas de milhares de não lidas não pode
  // segurar a conexão da conta numa rodada só.
  it('leva um teto de mensagens por tentativa', async () => {
    const { MAX_FOLDER_READ_PER_ATTEMPT } = await import('@/lib/email/replay');
    await folderReadRoute(post({ account: mailId, folder: 'Clientes' }));

    expect(vi.mocked(markFolderRead).mock.calls[0][2]).toBe(MAX_FOLDER_READ_PER_ATTEMPT);
  });

  it('recusa uma pasta que o servidor não declarou', async () => {
    const res = await folderReadRoute(post({ account: mailId, folder: '../outra' }));
    expect(res.status).toBe(404);
    expect(markFolderRead).not.toHaveBeenCalled();
  });
});

describe('mover mensagens para outra pasta', () => {
  it('move o lote inteiro num comando só', async () => {
    await batchRoute(
      post({
        targets: [
          { account: mailId, id: '1' },
          { account: mailId, id: '2' },
        ],
        action: 'move',
        folder: 'Arquivo',
        folderPath: 'Clientes',
      }),
    );

    expect(moveEmails).toHaveBeenCalledTimes(1);
    const [, uids, origem, destino] = vi.mocked(moveEmails).mock.calls[0];
    expect(uids).toEqual(['1', '2']);
    expect(origem).toBe('Clientes');
    expect(destino).toBe('Arquivo');
  });

  // Movida é movida: ela sai da pasta de origem assim que o pedido é gravado,
  // sem esperar o servidor concordar.
  it('tira a mensagem da pasta de origem enquanto a mudança está pendente', async () => {
    await batchRoute(
      post({
        targets: [{ account: mailId, id: '1' }],
        action: 'move',
        folder: 'Arquivo',
        folderPath: 'Clientes',
      }),
    );

    expect((await mensagensDaPasta()).map((m) => m.id)).toEqual(['3', '2']);
  });

  // Esconder uma mensagem que continua na pasta seria mentir sobre o servidor.
  it('devolve a mensagem com o erro quando a mudança falha em definitivo', async () => {
    vi.mocked(moveEmails).mockRejectedValue(new Error('pasta de destino recusada'));
    await batchRoute(
      post({
        targets: [{ account: mailId, id: '1' }],
        action: 'move',
        folder: 'Arquivo',
        folderPath: 'Clientes',
      }),
    );

    const { replayPendingActions } = await import('@/lib/email/replay');
    const { listConnections } = await import('@/lib/vault/connections');
    const conns = listConnections(ME.id, 'email');
    for (let i = 0; i < 10; i += 1) {
      await replayPendingActions(ME.id, conns, new Date(Date.now() + i * 3_600_000));
    }

    const mensagens = await mensagensDaPasta();
    expect(mensagens.find((m) => m.id === '1')?.actionError).toMatch(/recusada/);
  });

  it('exige um destino que o servidor declarou', async () => {
    const res = await batchRoute(
      post({
        targets: [{ account: mailId, id: '1' }],
        action: 'move',
        folder: 'Inventada',
        folderPath: 'Clientes',
      }),
    );
    const data = await res.json();

    expect(data.results[0]).toMatchObject({ ok: false });
    expect(moveEmails).not.toHaveBeenCalled();
  });

  // Mover para a pasta em que a mensagem já está não é uma operação.
  it('recusa mover para a própria pasta de origem', async () => {
    const res = await batchRoute(
      post({
        targets: [{ account: mailId, id: '1' }],
        action: 'move',
        folder: 'Clientes',
        folderPath: 'Clientes',
      }),
    );

    expect((await res.json()).results[0]).toMatchObject({ ok: false });
    expect(moveEmails).not.toHaveBeenCalled();
  });
});
