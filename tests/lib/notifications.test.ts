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
    expect(isRead('u-1', 'jira_mention', 'ENG-1')).toBe(false);
    markRead('u-1', 'jira_mention', 'ENG-1');
    expect(isRead('u-1', 'jira_mention', 'ENG-1')).toBe(true);
  });

  it('marcar duas vezes não falha (idempotente)', async () => {
    const { markRead, isRead } = await import('@/lib/notifications');
    markRead('u-1', 'jira_mention', 'ENG-1');
    markRead('u-1', 'jira_mention', 'ENG-1');
    expect(isRead('u-1', 'jira_mention', 'ENG-1')).toBe(true);
  });

  it('fontes diferentes com o mesmo id externo não se confundem', async () => {
    const { markRead, isRead } = await import('@/lib/notifications');
    markRead('u-1', 'jira_mention', 'X-1');
    expect(isRead('u-1', 'outra_fonte', 'X-1')).toBe(false);
  });
});

const JIRA_CONNECTION = {
  id: 'jira-1',
  module: 'jira' as const,
  label: 'Jira',
  values: { cloud: 'acme', email: 'a@x.com', token: 't' },
};

describe('getNotifications', () => {
  it('marca como lidas as issues já dispensadas antes', async () => {
    vi.doMock('@/lib/integrations/jiraApi', () => ({
      fetchMentions: vi.fn(async () => [
        {
          key: 'ENG-1', summary: 'Corrigir bug', status: '', project: 'ENG',
          url: 'https://x/ENG-1', parent: null, role: 'assignee' as const, kind: '', subtask: false,
        },
      ]),
    }));
    const { markRead, getNotifications } = await import('@/lib/notifications');
    markRead('u-1', 'jira_mention', 'ENG-1');
    const items = await getNotifications('u-1', JIRA_CONNECTION);
    expect(items).toHaveLength(1);
    expect(items[0].read).toBe(true);
    expect(items[0].title).toContain('ENG-1');
  });

  it('não vaza o estado de lida entre usuários', async () => {
    vi.doMock('@/lib/integrations/jiraApi', () => ({
      fetchMentions: vi.fn(async () => [
        {
          key: 'ENG-1', summary: 'Corrigir bug', status: '', project: 'ENG',
          url: 'https://x/ENG-1', parent: null, role: 'assignee' as const, kind: '', subtask: false,
        },
      ]),
    }));
    const { markRead, getNotifications } = await import('@/lib/notifications');
    markRead('u-1', 'jira_mention', 'ENG-1');
    const items = await getNotifications('u-2', JIRA_CONNECTION);
    expect(items[0].read).toBe(false);
  });
});
