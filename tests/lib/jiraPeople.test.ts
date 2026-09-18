import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { isJiraAccountId } from '@/lib/jiraAccount';
import { jiraFollowedPeople, setJiraFollowedPeople } from '@/lib/preferences';
import { fetchPersonView } from '@/lib/jiraPeople';
import { getDb } from '@/lib/db';
import type { Connection } from '@/lib/vault/connections';
import * as jiraApi from '@/lib/integrations/jiraApi';

describe('isJiraAccountId', () => {
  it('aceita accountId em diferentes formatos e rejeita inválidos', () => {
    expect(isJiraAccountId('557058:1b2c3d4e-1234')).toBe(true);
    expect(isJiraAccountId('123456abcdef123456abcdef')).toBe(true);
    expect(isJiraAccountId('invalid space')).toBe(false);
    expect(isJiraAccountId('"')).toBe(false);
    expect(isJiraAccountId('')).toBe(false);
    expect(isJiraAccountId(null)).toBe(false);
  });
});

describe('preferences de pessoas no Jira', () => {
  beforeEach(() => {
    getDb().prepare('DELETE FROM preferences').run();
  });

  const u = 'u1';

  it('lida com JSON quebrado e deduplica', () => {
    getDb()
      .prepare('INSERT INTO preferences (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)')
      .run(u, 'jiraFollowedPeople', '{[ broken json', new Date().toISOString());

    expect(jiraFollowedPeople(u)).toEqual([]);

    setJiraFollowedPeople(u, [
      { accountId: '123', displayName: 'Ana' },
      { accountId: '123', displayName: 'Ana Souza' },
      { accountId: 'invalid"', displayName: 'Bob' },
      { accountId: '456', displayName: '  Carlos ' },
    ]);

    expect(jiraFollowedPeople(u)).toEqual([
      { accountId: '123', displayName: 'Ana' },
      { accountId: '456', displayName: 'Carlos' },
    ]);
  });

  it('limita a 10 pessoas acompanhadas', () => {
    const list = Array.from({ length: 15 }, (_, i) => ({ accountId: `id${i}`, displayName: `Pessoa ${i}` }));
    setJiraFollowedPeople(u, list);
    expect(jiraFollowedPeople(u)).toHaveLength(10);
  });
});

describe('fetchPersonView', () => {
  const CONN = {} as Connection;

  it('traz resultados de todas as listas e não derruba tudo por causa de uma falha', async () => {
    vi.spyOn(jiraApi, 'fetchIssues').mockResolvedValue([]);
    vi.spyOn(jiraApi, 'fetchDelivered').mockResolvedValue([]);
    vi.spyOn(jiraApi, 'fetchApproved').mockRejectedValue(new Error('Falha no banco de dados'));
    vi.spyOn(jiraApi, 'fetchProblems').mockResolvedValue([]);

    const view = await fetchPersonView(CONN, '123');

    expect(view.jira.data).toEqual([]);
    expect(view.delivered.data).toEqual([]);
    expect(view.approved.data).toBeNull();
    expect(view.approved.error).toBe('Falha no banco de dados');
    expect(view.problems.data).toEqual([]);
  });
});
