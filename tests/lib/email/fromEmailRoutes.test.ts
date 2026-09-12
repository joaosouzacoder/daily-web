import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('@/lib/integrations/imap', () => ({
  listMailboxes: vi.fn(),
  fetchFolderChanges: vi.fn(),
  fetchBodyParts: vi.fn(),
}));
vi.mock('@/lib/notesSync', () => ({ scheduleNotesSync: vi.fn(), notesSyncStatus: vi.fn() }));
vi.mock('@/lib/tasks', () => ({ addTask: vi.fn(), fetchTasks: vi.fn() }));

const currentUser = vi.fn();
vi.mock('@/lib/auth/currentUser', () => ({ getCurrentUser: () => currentUser() }));

import { listMailboxes, fetchFolderChanges, fetchBodyParts } from '@/lib/integrations/imap';
import { addTask } from '@/lib/tasks';
import { GET as mailboxesRoute } from '@/app/api/email/mailboxes/route';
import { GET as messagesRoute } from '@/app/api/email/messages/route';
import { POST as toNoteRoute } from '@/app/api/email/to-note/route';
import { POST as toTaskRoute } from '@/app/api/email/to-task/route';

const ME = { id: 'u-1', username: 'joao', passwordHash: 'x', isAdmin: true, createdAt: '' };

let dir: string;
let mailId: string;

function envelope(over: Record<string, unknown> = {}) {
  return {
    id: '42',
    account: mailId,
    accountLabel: 'Trabalho',
    from: 'Milton Yoshida',
    subject: 'Revisão do PR #481',
    unread: true,
    date: '2026-09-12T10:00:00Z',
    messageId: '<a@b>',
    references: [],
    labels: [],
    mailbox: 'inbox' as const,
    folder: 'INBOX',
    ...over,
  };
}

const post = (body: unknown) =>
  new NextRequest('http://localhost/api', { method: 'POST', body: JSON.stringify(body) });
const get = (q: string) => new NextRequest(`http://localhost/api/email?${q}`);

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-from-email-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  process.env.DAILY_WEB_SECRET_KEY = Buffer.alloc(32, 17).toString('base64');
  vi.clearAllMocks();
  currentUser.mockResolvedValue(ME);

  const { getDb } = await import('@/lib/db');
  getDb();
  const { resetCreationsForTests } = await import('@/lib/email/fromEmail');
  resetCreationsForTests();
  const { resetMailboxSyncForTests } = await import('@/lib/email/mailboxes');
  resetMailboxSyncForTests();

  const { saveConnection } = await import('@/lib/vault/connections');
  mailId = saveConnection(ME.id, 'email', 'Trabalho', {
    preset: 'gmail',
    user: 'a@x.com',
    password: 's',
  });

  vi.mocked(listMailboxes).mockResolvedValue([
    { path: 'INBOX', name: 'INBOX', delimiter: '/', parent: null, specialUse: null, total: 1, unread: 1 },
  ]);
  vi.mocked(fetchFolderChanges).mockResolvedValue({
    uidvalidity: '100',
    added: [envelope()] as never,
    flags: [{ uid: '42', unread: true, labels: [] }],
    windowFrom: '1',
    total: 1,
  });
  vi.mocked(fetchBodyParts).mockResolvedValue({
    text: 'texto simples',
    html: '<p>Segue o <a href="https://exemplo.com/pr/481">link do PR</a>.</p>',
  });
  vi.mocked(addTask).mockResolvedValue('tarefa-1');

  // A mensagem precisa estar sincronizada: é de lá que saem assunto e remetente.
  await mailboxesRoute(get(`account=${mailId}&sync=1`));
  await messagesRoute(get(`account=${mailId}&folder=INBOX`));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/email/to-note', () => {
  it('usa o assunto como título e o corpo convertido como texto', async () => {
    const res = await toNoteRoute(post({ account: mailId, id: '42' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    const { listNotes } = await import('@/lib/notes');
    const nota = listNotes(ME.id).find((n) => n.id === data.noteId)!;
    expect(nota.title).toBe('Revisão do PR #481');
    expect(nota.body).toBe('Segue o [link do PR](https://exemplo.com/pr/481).');
  });

  // A nota é Markdown e o editor a renderiza: HTML cru ali seria marcação de
  // estranho dentro de uma tela nossa.
  it('não guarda marcação nenhuma na nota', async () => {
    vi.mocked(fetchBodyParts).mockResolvedValue({
      text: '',
      html: '<p onclick="x()">oi<script>alert(1)</script><iframe src="https://m"></iframe></p>',
    });
    const data = await (await toNoteRoute(post({ account: mailId, id: '42' }))).json();

    const { listNotes } = await import('@/lib/notes');
    const nota = listNotes(ME.id).find((n) => n.id === data.noteId)!;
    expect(nota.body).not.toMatch(/<[a-z]/i);
    expect(nota.body).not.toContain('alert');
  });

  it('nasce sem pasta quando nenhuma é escolhida', async () => {
    const data = await (await toNoteRoute(post({ account: mailId, id: '42' }))).json();
    const { listNotes } = await import('@/lib/notes');
    expect(listNotes(ME.id).find((n) => n.id === data.noteId)!.folderId).toBeNull();
  });

  it('nasce na pasta escolhida', async () => {
    const { createFolder } = await import('@/lib/noteFolders');
    const pasta = createFolder(ME.id, 'Trabalho', null);

    const data = await (
      await toNoteRoute(post({ account: mailId, id: '42', folderId: pasta.id }))
    ).json();

    const { listNotes } = await import('@/lib/notes');
    expect(listNotes(ME.id).find((n) => n.id === data.noteId)!.folderId).toBe(pasta.id);
  });

  // A caixa pode não responder na hora do clique; o texto já lido serve.
  it('cai no corpo em cache quando a caixa não responde', async () => {
    const { putCachedBody } = await import('@/lib/emailCache');
    putCachedBody(ME.id, mailId, '42', 'o que já tinha sido lido', 'inbox');
    vi.mocked(fetchBodyParts).mockRejectedValue(new Error('caixa fora do ar'));

    const data = await (await toNoteRoute(post({ account: mailId, id: '42' }))).json();

    const { listNotes } = await import('@/lib/notes');
    expect(listNotes(ME.id).find((n) => n.id === data.noteId)!.body).toBe(
      'o que já tinha sido lido',
    );
  });

  // O duplo envio sai antes de a primeira resposta voltar.
  it('não cria duas com o clique repetido', async () => {
    const a = await (await toNoteRoute(post({ account: mailId, id: '42' }))).json();
    const b = await (await toNoteRoute(post({ account: mailId, id: '42' }))).json();

    expect(b.noteId).toBe(a.noteId);
    expect(b.repeated).toBe(true);
    const { listNotes } = await import('@/lib/notes');
    expect(listNotes(ME.id)).toHaveLength(1);
  });

  it('recusa a conta de outra pessoa', async () => {
    const res = await toNoteRoute(post({ account: 'nao-existe', id: '42' }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/email/to-task', () => {
  it('leva o assunto e quem escreveu, e nada do corpo', async () => {
    const res = await toTaskRoute(post({ account: mailId, id: '42' }));

    expect(res.status).toBe(200);
    expect(addTask).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addTask).mock.calls[0][1]).toBe('Revisão do PR #481 — Milton Yoshida');
    expect(fetchBodyParts).not.toHaveBeenCalled();
  });

  it('usa o endereço quando o remetente não mandou nome', async () => {
    vi.mocked(fetchFolderChanges).mockResolvedValue({
      uidvalidity: '100',
      added: [envelope({ id: '43', from: 'cobranca@banco.com', subject: 'Fatura' })] as never,
      flags: [
        { uid: '42', unread: true, labels: [] },
        { uid: '43', unread: true, labels: [] },
      ],
      windowFrom: '1',
      total: 2,
    } as never);
    await messagesRoute(get(`account=${mailId}&folder=INBOX`));

    await toTaskRoute(post({ account: mailId, id: '43' }));

    expect(vi.mocked(addTask).mock.calls[0][1]).toBe('Fatura — cobranca@banco.com');
  });

  it('não cria duas com o clique repetido', async () => {
    const a = await (await toTaskRoute(post({ account: mailId, id: '42' }))).json();
    const b = await (await toTaskRoute(post({ account: mailId, id: '42' }))).json();

    expect(b.taskId).toBe(a.taskId);
    expect(addTask).toHaveBeenCalledTimes(1);
  });

  it('recusa uma mensagem que não está sincronizada', async () => {
    const res = await toTaskRoute(post({ account: mailId, id: '999' }));
    expect(res.status).toBe(404);
    expect(addTask).not.toHaveBeenCalled();
  });
});
