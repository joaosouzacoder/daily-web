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
  deleteEmails: vi.fn(),
}));

const currentUser = vi.fn();
vi.mock('@/lib/auth/currentUser', () => ({ getCurrentUser: () => currentUser() }));

import { listMailboxes, fetchFolderChanges, deleteEmails } from '@/lib/integrations/imap';
import { GET as mailboxesRoute } from '@/app/api/email/mailboxes/route';
import { GET as messagesRoute } from '@/app/api/email/messages/route';
import { POST as batchRoute } from '@/app/api/email/batch/route';
import type { MailboxNode } from '@/lib/types';

const ME = { id: 'u-1', username: 'joao', passwordHash: 'x', isAdmin: true, createdAt: '' };

let dir: string;
let mailId: string;

const ARVORE: MailboxNode[] = [
  { path: 'INBOX', name: 'INBOX', delimiter: '/', parent: null, specialUse: null, total: 12, unread: 3 },
  {
    path: '[Gmail]/E-mails enviados',
    name: 'E-mails enviados',
    delimiter: '/',
    parent: '[Gmail]',
    specialUse: '\\Sent',
    total: 40,
    unread: 0,
  },
  { path: 'Clientes', name: 'Clientes', delimiter: '/', parent: null, specialUse: null, total: 5, unread: 1 },
];

function envelope(over: Record<string, unknown> = {}) {
  return {
    id: '7',
    account: mailId,
    accountLabel: 'Trabalho',
    from: 'Alguém',
    subject: 'Assunto',
    unread: true,
    date: '2026-09-12T10:00:00Z',
    messageId: '<a@b>',
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

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-folders-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  process.env.DAILY_WEB_SECRET_KEY = Buffer.alloc(32, 9).toString('base64');
  vi.clearAllMocks();
  currentUser.mockResolvedValue(ME);

  const { getDb } = await import('@/lib/db');
  getDb();
  const { resetMailboxSyncForTests } = await import('@/lib/email/mailboxes');
  resetMailboxSyncForTests();
  const { saveConnection } = await import('@/lib/vault/connections');
  mailId = saveConnection(ME.id, 'email', 'Trabalho', {
    preset: 'gmail',
    user: 'a@x.com',
    password: 's',
  });

  vi.mocked(listMailboxes).mockResolvedValue(ARVORE);
  vi.mocked(fetchFolderChanges).mockResolvedValue({
    uidvalidity: '100',
    added: [envelope()] as never,
    flags: [{ uid: '7', unread: true, labels: [] }],
    windowFrom: '1',
    total: 5,
  });
  vi.mocked(deleteEmails).mockResolvedValue(undefined);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/email/mailboxes', () => {
  it('devolve a árvore com os totais de cada pasta', async () => {
    const res = await mailboxesRoute(get(`account=${mailId}&sync=1`));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.mailboxes).toHaveLength(3);
    expect(data.mailboxes[0]).toMatchObject({ path: 'INBOX', total: 12, unread: 3 });
  });

  // Contar mensagem é uma ida ao servidor por pasta. Abrir o painel precisa
  // ser instantâneo, então a leitura normal responde do banco.
  it('responde do banco sem tocar no servidor', async () => {
    await mailboxesRoute(get(`account=${mailId}&sync=1`));
    vi.mocked(listMailboxes).mockClear();

    const data = await (await mailboxesRoute(get(`account=${mailId}`))).json();

    expect(listMailboxes).not.toHaveBeenCalled();
    expect(data.cached).toBe(true);
    expect(data.mailboxes).toHaveLength(3);
    expect(data.syncedAt).toBeTruthy();
  });

  // Uma caixa fora do ar não pode apagar a árvore que já existe: a tela
  // continua mostrando o que tinha e oferece tentar de novo.
  it('mantém a árvore guardada quando a sincronização falha', async () => {
    await mailboxesRoute(get(`account=${mailId}&sync=1`));
    vi.mocked(listMailboxes).mockRejectedValue(new Error('caixa fora do ar'));

    const falha = await mailboxesRoute(get(`account=${mailId}&sync=1`));
    expect(falha.status).toBe(502);

    const data = await (await mailboxesRoute(get(`account=${mailId}`))).json();
    expect(data.mailboxes).toHaveLength(3);
  });

  // Duas aberturas ao mesmo tempo pediriam a mesma árvore duas vezes, e cada
  // pedido é uma ida ao servidor por pasta.
  it('junta sincronizações simultâneas da mesma conta numa só', async () => {
    let liberar: (v: unknown) => void = () => {};
    vi.mocked(listMailboxes).mockImplementation(
      () => new Promise((resolve) => (liberar = resolve as (v: unknown) => void)) as never,
    );

    const { syncMailboxes } = await import('@/lib/email/mailboxes');
    const { findConnection } = await import('@/lib/vault/connections');
    const conn = findConnection(ME.id, mailId)!;

    const a = syncMailboxes(ME.id, conn);
    const b = syncMailboxes(ME.id, conn);
    liberar(ARVORE);
    await Promise.all([a, b]);

    expect(listMailboxes).toHaveBeenCalledTimes(1);
  });

  it('anuncia a pasta criada e a que sumiu', async () => {
    await mailboxesRoute(get(`account=${mailId}&sync=1`));

    vi.mocked(listMailboxes).mockResolvedValue([
      ARVORE[0],
      { ...ARVORE[2], path: 'Fornecedores', name: 'Fornecedores' },
    ]);
    const data = await (await mailboxesRoute(get(`account=${mailId}&sync=1`))).json();

    expect(data.added).toEqual(['Fornecedores']);
    expect(data.removed.sort()).toEqual(['Clientes', '[Gmail]/E-mails enviados']);
  });

  it('recusa a conta de outra pessoa', async () => {
    const res = await mailboxesRoute(get('account=nao-existe'));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/email/messages', () => {
  it('lista as mensagens da pasta pedida', async () => {
    await mailboxesRoute(get(`account=${mailId}&sync=1`));
    const res = await messagesRoute(get(`account=${mailId}&folder=Clientes`));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(vi.mocked(fetchFolderChanges).mock.calls[0][1]).toBe('Clientes');
    expect(data.messages).toHaveLength(1);
  });

  // A pasta vem da tela, que é entrada não confiável: um caminho inventado
  // abriria uma caixa que ninguém escolheu.
  it('recusa uma pasta que o servidor não declarou', async () => {
    const res = await messagesRoute(get(`account=${mailId}&folder=../outra`));
    expect(res.status).toBe(404);
    expect(fetchFolderChanges).not.toHaveBeenCalled();
  });

  it('exige a pasta', async () => {
    const res = await messagesRoute(get(`account=${mailId}`));
    expect(res.status).toBe(400);
  });

  // Nada sem limite: a caixa inteira não cabe numa resposta nem numa tela.
  it('prende o limite pedido ao teto', async () => {
    await mailboxesRoute(get(`account=${mailId}&sync=1`));
    await messagesRoute(get(`account=${mailId}&folder=Clientes&limit=9999`));

    expect(vi.mocked(fetchFolderChanges).mock.calls[0][4]).toBe(100);
  });

  it('esconde da pasta a mensagem com exclusão pendente', async () => {
    await mailboxesRoute(get(`account=${mailId}&sync=1`));
    await batchRoute(
      new NextRequest('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({
          targets: [{ account: mailId, id: '7' }],
          action: 'delete',
          folderPath: 'Clientes',
        }),
      }),
    );

    const data = await (await messagesRoute(get(`account=${mailId}&folder=Clientes`))).json();

    expect(data.messages).toEqual([]);
  });

  // O servidor reindexou a caixa: todo uid guardado antes aponta para outra
  // mensagem agora, e aplicá-lo acertaria quem não foi escolhido.
  it('invalida as ações pendentes quando o uidvalidity muda', async () => {
    await mailboxesRoute(get(`account=${mailId}&sync=1`));
    // A pasta é aberta uma vez: é daí que sai o número que a ação guarda.
    await messagesRoute(get(`account=${mailId}&folder=Clientes`));
    await batchRoute(
      new NextRequest('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({
          targets: [{ account: mailId, id: '7' }],
          action: 'delete',
          folderPath: 'Clientes',
        }),
      }),
    );

    vi.mocked(fetchFolderChanges).mockResolvedValue({
      uidvalidity: '200',
      added: [envelope()] as never,
      flags: [{ uid: '7', unread: true, labels: [] }],
      windowFrom: '1',
      total: 5,
    });
    await messagesRoute(get(`account=${mailId}&folder=Clientes`));

    const { listPendingActions } = await import('@/lib/email/pendingActions');
    const pendentes = listPendingActions(ME.id);
    expect(pendentes[0].state).toBe('failed');
    expect(pendentes[0].lastError).toMatch(/reindexada/);
  });
});

describe('ordem das pastas', () => {
  it('põe a entrada primeiro e as de sistema antes das demais', async () => {
    const { sortMailboxes } =
      await vi.importActual<typeof import('@/lib/integrations/imap')>('@/lib/integrations/imap');
    const ordenadas = sortMailboxes([
      { ...ARVORE[2] },
      { ...ARVORE[1] },
      { ...ARVORE[0] },
      { ...ARVORE[2], path: 'Arquivo', name: 'Arquivo' },
    ]);

    expect(ordenadas.map((m) => m.path)).toEqual([
      'INBOX',
      '[Gmail]/E-mails enviados',
      'Arquivo',
      'Clientes',
    ]);
  });
});
