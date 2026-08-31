import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const currentUser = vi.fn();
vi.mock('@/lib/auth/currentUser', () => ({ getCurrentUser: () => currentUser() }));

const ME = { id: 'u-1', username: 'joao', passwordHash: 'x', isAdmin: true, createdAt: '' };
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetModules();
  process.env.DAILY_WEB_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'daily-web-db-')), 'test.db');
  currentUser.mockReturnValue(ME);
});

describe('POST /api/notifications/[id]/read', () => {
  // A rota fixava a fonte em 'jira_mention'. O aviso de PR era gravado na
  // chave errada e voltava a aparecer no ciclo seguinte, para sempre.
  it('grava o aviso de PR na fonte pull_request', async () => {
    const { POST } = await import('@/app/api/notifications/[id]/read/route');
    const { isRead } = await import('@/lib/notifications');

    const res = await POST(new Request('http://localhost'), params('pull_request:joao/repo#7'));
    expect(res.status).toBe(200);
    expect(isRead('u-1', 'pull_request', 'joao/repo#7')).toBe(true);
    expect(isRead('u-1', 'jira_mention', 'joao/repo#7')).toBe(false);
  });

  it('grava o aviso de e-mail na fonte email, com o id externo inteiro', async () => {
    const { POST } = await import('@/app/api/notifications/[id]/read/route');
    const { isRead } = await import('@/lib/notifications');

    await POST(new Request('http://localhost'), params('email:mail-1:<a@x>'));
    expect(isRead('u-1', 'email', 'mail-1:<a@x>')).toBe(true);
  });

  it('continua gravando a menção do Jira como antes', async () => {
    const { POST } = await import('@/app/api/notifications/[id]/read/route');
    const { isRead } = await import('@/lib/notifications');

    await POST(new Request('http://localhost'), params('jira_mention:ENG-1'));
    expect(isRead('u-1', 'jira_mention', 'ENG-1')).toBe(true);
  });

  it('recusa um id que não nomeia uma fonte conhecida', async () => {
    const { POST } = await import('@/app/api/notifications/[id]/read/route');
    const res = await POST(new Request('http://localhost'), params('inventada:X-1'));
    expect(res.status).toBe(400);
  });

  it('não deixa quem não entrou marcar nada como lido', async () => {
    currentUser.mockReturnValue(null);
    const { POST } = await import('@/app/api/notifications/[id]/read/route');
    const res = await POST(new Request('http://localhost'), params('jira_mention:ENG-1'));
    expect(res.status).toBe(401);
  });
});
