import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let dir: string;
const USER = 'user-1';

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-watch-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  const { getDb } = await import('@/lib/db');
  getDb();
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('isJiraKey', () => {
  it('aceita o formato de chave do Jira', async () => {
    const { isJiraKey } = await import('@/lib/preferences');
    for (const boa of ['TT-1', 'PDS-1735', 'SEA-585', 'ABC123-9', 'A_B-10']) {
      expect(isJiraKey(boa), boa).toBe(true);
    }
  });

  // A chave entra numa JQL; valor livre ali seria injeção de consulta.
  it('recusa o que não é chave', async () => {
    const { isJiraKey } = await import('@/lib/preferences');
    for (const ruim of [
      'TT', '-1', 'TT-', 'tt 1', '1-TT', 'TT-1"', 'TT-1) OR (1=1', '', null, 42,
    ]) {
      expect(isJiraKey(ruim), JSON.stringify(ruim)).toBe(false);
    }
  });

  it('aceita minúscula, que é normalizada depois', async () => {
    const { isJiraKey } = await import('@/lib/preferences');
    expect(isJiraKey('tt-1')).toBe(true);
  });
});

describe('lista de acompanhamento', () => {
  it('começa vazia', async () => {
    const { jiraWatchedKeys } = await import('@/lib/preferences');
    expect(jiraWatchedKeys(USER)).toEqual([]);
  });

  it('guarda e devolve em caixa alta', async () => {
    const { jiraWatchedKeys, setJiraWatchedKeys } = await import('@/lib/preferences');
    setJiraWatchedKeys(USER, ['tt-1', 'PDS-2']);
    expect(jiraWatchedKeys(USER)).toEqual(['TT-1', 'PDS-2']);
  });

  it('não guarda a mesma chave duas vezes', async () => {
    const { jiraWatchedKeys, setJiraWatchedKeys } = await import('@/lib/preferences');
    setJiraWatchedKeys(USER, ['TT-1', 'tt-1', 'TT-1']);
    expect(jiraWatchedKeys(USER)).toEqual(['TT-1']);
  });

  it('descarta o que não é chave', async () => {
    const { jiraWatchedKeys, setJiraWatchedKeys } = await import('@/lib/preferences');
    setJiraWatchedKeys(USER, ['TT-1', 'lixo', '', 'PDS-2']);
    expect(jiraWatchedKeys(USER)).toEqual(['TT-1', 'PDS-2']);
  });

  it('é por usuário', async () => {
    const { jiraWatchedKeys, setJiraWatchedKeys } = await import('@/lib/preferences');
    setJiraWatchedKeys(USER, ['TT-1']);
    expect(jiraWatchedKeys('outro')).toEqual([]);
  });
});
