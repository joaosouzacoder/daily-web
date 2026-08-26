import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('@/lib/integrations/imap', () => ({ listEnvelopes: vi.fn(), fetchBody: vi.fn() }));
vi.mock('@/lib/integrations/ics', () => ({ fetchAgenda: vi.fn() }));
vi.mock('@/lib/integrations/githubApi', () => ({ fetchPulls: vi.fn() }));
vi.mock('@/lib/integrations/jiraApi', () => ({ fetchIssues: vi.fn(), fetchMentions: vi.fn() }));
vi.mock('@/lib/tasks', () => ({ fetchTasks: vi.fn() }));

import { listEnvelopes } from '@/lib/integrations/imap';
import { fetchAgenda } from '@/lib/integrations/ics';
import { fetchPulls } from '@/lib/integrations/githubApi';
import { fetchIssues, fetchMentions } from '@/lib/integrations/jiraApi';
import { fetchTasks } from '@/lib/tasks';

let dir: string;

const USER = 'user-1';
const OTHER = 'user-2';

function envelope(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: '1',
    account: 'mail-1',
    accountLabel: 'Trabalho',
    from: 'Alguém',
    subject: 'Assunto',
    unread: true,
    date: '2026-08-26T10:00:00Z',
    messageId: '<a@b>',
    ...over,
  };
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-refresh-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  process.env.DAILY_WEB_SECRET_KEY = Buffer.alloc(32, 3).toString('base64');
  vi.clearAllMocks();

  const { getDb } = await import('@/lib/db');
  getDb();
  const { resetCachesForTests } = await import('@/lib/refresher');
  resetCachesForTests();

  vi.mocked(listEnvelopes).mockResolvedValue([]);
  vi.mocked(fetchAgenda).mockResolvedValue([]);
  vi.mocked(fetchPulls).mockResolvedValue({ items: [], errors: [] });
  vi.mocked(fetchIssues).mockResolvedValue([]);
  vi.mocked(fetchMentions).mockResolvedValue([]);
  vi.mocked(fetchTasks).mockResolvedValue([]);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function connect(userId: string, moduleId: 'email' | 'agenda' | 'jira' | 'pulls', values: Record<string, string>) {
  const { saveConnection } = await import('@/lib/vault/connections');
  return saveConnection(userId, moduleId, moduleId, values);
}

describe('módulos desligados', () => {
  it('não chama integração de módulo que o usuário não ligou', async () => {
    const { refreshAll } = await import('@/lib/refresher');
    await refreshAll(USER);

    expect(listEnvelopes).not.toHaveBeenCalled();
    expect(fetchAgenda).not.toHaveBeenCalled();
    expect(fetchIssues).not.toHaveBeenCalled();
    expect(fetchPulls).not.toHaveBeenCalled();
  });

  // Painel desligado não é "vazio" nem "com erro": é ausência. A tela usa
  // isso para não desenhar a seção.
  it('devolve dado e erro nulos para o módulo desligado', async () => {
    const { refreshAll } = await import('@/lib/refresher');
    const state = await refreshAll(USER);

    expect(state.email).toEqual({ data: null, error: null });
    expect(state.modules).not.toContain('email');
  });

  it('anuncia os módulos ligados no estado', async () => {
    await connect(USER, 'agenda', { icsUrl: 'https://x/a.ics' });
    const { refreshAll } = await import('@/lib/refresher');
    const state = await refreshAll(USER);

    expect(state.modules).toContain('agenda');
    expect(fetchAgenda).toHaveBeenCalledTimes(1);
  });
});

describe('várias conexões no mesmo módulo', () => {
  it('junta os e-mails das duas caixas', async () => {
    await connect(USER, 'email', { preset: 'gmail', user: 'a@x.com', password: 's' });
    await connect(USER, 'email', { preset: 'gmail', user: 'b@x.com', password: 's' });

    vi.mocked(listEnvelopes)
      .mockResolvedValueOnce([envelope({ id: '1' })])
      .mockResolvedValueOnce([envelope({ id: '2' })]);

    const { refreshAll } = await import('@/lib/refresher');
    const state = await refreshAll(USER);

    expect(state.email.data).toHaveLength(2);
    expect(state.email.error).toBeNull();
    expect(state.mailboxes).toHaveLength(2);
  });

  // Uma caixa fora do ar não pode apagar da tela os e-mails da outra.
  it('mantém os dados da caixa que funcionou e reporta o erro da outra', async () => {
    await connect(USER, 'email', { preset: 'gmail', user: 'a@x.com', password: 's' });
    await connect(USER, 'email', { preset: 'gmail', user: 'b@x.com', password: 's' });

    vi.mocked(listEnvelopes)
      .mockResolvedValueOnce([envelope({ id: '1' })])
      .mockRejectedValueOnce(new Error('Pessoal: senha recusada'));

    const { refreshAll } = await import('@/lib/refresher');
    const state = await refreshAll(USER);

    expect(state.email.data).toHaveLength(1);
    expect(state.email.error).toContain('senha recusada');
  });

  it('só reporta erro quando nenhuma caixa respondeu', async () => {
    await connect(USER, 'email', { preset: 'gmail', user: 'a@x.com', password: 's' });
    vi.mocked(listEnvelopes).mockRejectedValue(new Error('caiu'));

    const { refreshAll } = await import('@/lib/refresher');
    const state = await refreshAll(USER);

    expect(state.email.data).toBeNull();
    expect(state.email.error).toContain('caiu');
  });
});

describe('isolamento entre usuários', () => {
  it('usa a conexão do próprio usuário, não a de outro', async () => {
    await connect(USER, 'jira', { cloud: 'acme-do-joao', email: 'a@x.com', token: 't' });
    await connect(OTHER, 'jira', { cloud: 'acme-da-maria', email: 'b@x.com', token: 'u' });

    const { refreshAll } = await import('@/lib/refresher');
    await refreshAll(OTHER);

    expect(fetchIssues).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchIssues).mock.calls[0][0].values.cloud).toBe('acme-da-maria');
  });

  it('não devolve para um usuário o cache do outro', async () => {
    await connect(USER, 'email', { preset: 'gmail', user: 'a@x.com', password: 's' });
    vi.mocked(listEnvelopes).mockResolvedValue([envelope()]);

    const { refreshAll, getCachedState } = await import('@/lib/refresher');
    await refreshAll(USER);

    expect(getCachedState(USER)?.email.data).toHaveLength(1);
    expect(getCachedState(OTHER)).toBeNull();
  });

  it('dropCache derruba só o cache pedido', async () => {
    await connect(USER, 'email', { preset: 'gmail', user: 'a@x.com', password: 's' });
    await connect(OTHER, 'email', { preset: 'gmail', user: 'b@x.com', password: 's' });

    const { refreshAll, getCachedState, dropCache } = await import('@/lib/refresher');
    await refreshAll(USER);
    await refreshAll(OTHER);
    dropCache(USER);

    expect(getCachedState(USER)).toBeNull();
    expect(getCachedState(OTHER)).not.toBeNull();
  });
});

describe('notificações', () => {
  it('só busca menções quando o Jira está conectado', async () => {
    const { refreshAll } = await import('@/lib/refresher');
    await refreshAll(USER);
    expect(fetchMentions).not.toHaveBeenCalled();

    await connect(USER, 'jira', { cloud: 'acme', email: 'a@x.com', token: 't' });
    await refreshAll(USER);
    expect(fetchMentions).toHaveBeenCalledTimes(1);
  });
});
