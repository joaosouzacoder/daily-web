import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

beforeEach(() => {
  vi.resetModules();
  const dbPath = path.join(mkdtempSync(path.join(tmpdir(), 'daily-web-db-')), 'test.db');
  process.env.DAILY_WEB_DB_PATH = dbPath;
});

describe('notifications_read', () => {
  it('marca uma notificação como lida e não a esquece', async () => {
    const { markRead, isRead } = await import('@/lib/notifications');
    expect(isRead('jira_mention', 'ENG-1')).toBe(false);
    markRead('jira_mention', 'ENG-1');
    expect(isRead('jira_mention', 'ENG-1')).toBe(true);
  });

  it('marcar duas vezes não falha (idempotente)', async () => {
    const { markRead, isRead } = await import('@/lib/notifications');
    markRead('jira_mention', 'ENG-1');
    markRead('jira_mention', 'ENG-1');
    expect(isRead('jira_mention', 'ENG-1')).toBe(true);
  });

  it('fontes diferentes com o mesmo id externo não se confundem', async () => {
    const { markRead, isRead } = await import('@/lib/notifications');
    markRead('jira_mention', 'X-1');
    expect(isRead('outra_fonte', 'X-1')).toBe(false);
  });
});

describe('getNotifications', () => {
  it('marca como lidas as issues já dispensadas antes', async () => {
    vi.doMock('@/lib/cli/jira', () => ({
      fetchMentions: vi.fn(async () => [
        {
          key: 'ENG-1', summary: 'Corrigir bug', status: '', project: 'ENG',
          url: 'https://x/ENG-1', parent: null, role: 'assignee' as const, kind: '', subtask: false,
        },
      ]),
    }));
    const { markRead, getNotifications } = await import('@/lib/notifications');
    markRead('jira_mention', 'ENG-1');
    const items = await getNotifications();
    expect(items).toHaveLength(1);
    expect(items[0].read).toBe(true);
    expect(items[0].title).toContain('ENG-1');
  });
});
