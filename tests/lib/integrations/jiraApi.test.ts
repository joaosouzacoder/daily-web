import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDeliveredToday, jiraBaseUrl } from '@/lib/integrations/jiraApi';
import type { Connection } from '@/lib/vault/connections';

const CONN = {
  id: 'c1',
  module: 'jira',
  label: 'Jira',
  values: { cloud: 'acme', email: 'eu@acme.com', token: 'segredo' },
} as unknown as Connection;

/** Devolve o corpo da última chamada, que é onde a JQL viaja. */
function stubSearch(issues: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ issues }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jqlOf(fetchMock: ReturnType<typeof vi.fn>): string {
  return JSON.parse(fetchMock.mock.calls[0][1].body).jql;
}

afterEach(() => vi.unstubAllGlobals());

describe('jiraBaseUrl', () => {
  it('aceita o nome, o domínio e a URL inteira', () => {
    expect(jiraBaseUrl('acme')).toBe('https://acme.atlassian.net');
    expect(jiraBaseUrl('acme.atlassian.net')).toBe('https://acme.atlassian.net');
    expect(jiraBaseUrl('https://acme.atlassian.net/')).toBe('https://acme.atlassian.net');
  });
});

describe('fetchDeliveredToday', () => {
  // O nome do status final é livre por workflow — aqui é "Resolvido" e
  // "Fechado", em outra instância é "Done". Depender do nome quebraria fora
  // desta instância; a categoria e o histórico de transição, não.
  it('pergunta pelo que você encerrou hoje sem citar nome de status', async () => {
    const fetchMock = stubSearch([]);
    await fetchDeliveredToday(CONN);

    const jql = jqlOf(fetchMock);
    expect(jql).toContain('statusCategory = Done');
    expect(jql).toContain('status CHANGED BY currentUser() DURING (startOfDay(), now())');
    expect(jql).toContain('assignee = currentUser() AND resolved >= startOfDay()');
    expect(jql).not.toMatch(/Resolvido|Fechado|Done"/);
  });

  it('faz uma só ida ao Jira', async () => {
    const fetchMock = stubSearch([]);
    await fetchDeliveredToday(CONN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('traz a issue com a situação e o link de abrir', async () => {
    stubSearch([
      {
        key: 'PDS-10',
        fields: {
          summary: 'Ajuste do cashback',
          status: { name: 'Resolvido', statusCategory: { key: 'done' } },
          project: { key: 'PDS' },
          issuetype: { name: 'História', subtask: false },
          updated: '2026-08-31T18:00:00.000-0300',
        },
      },
    ]);

    const [item] = await fetchDeliveredToday(CONN);
    expect(item.key).toBe('PDS-10');
    expect(item.statusCategory).toBe('done');
    expect(item.status).toBe('Resolvido');
    expect(item.url).toBe('https://acme.atlassian.net/browse/PDS-10');
  });
});
