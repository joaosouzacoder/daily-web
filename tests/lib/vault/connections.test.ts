import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-conn-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  process.env.DAILY_WEB_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
  const { getDb } = await import('@/lib/db');
  getDb();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const USER = 'user-1';
const OTHER = 'user-2';

describe('conexões por usuário', () => {
  it('guarda e devolve os valores de uma conexão', async () => {
    const { saveConnection, listConnections } = await import('@/lib/vault/connections');
    saveConnection(USER, 'agenda', 'Pessoal', { icsUrl: 'https://exemplo/a.ics' });

    const [conn] = listConnections(USER, 'agenda');
    expect(conn.label).toBe('Pessoal');
    expect(conn.values.icsUrl).toBe('https://exemplo/a.ics');
  });

  it('aceita várias conexões do mesmo módulo', async () => {
    const { saveConnection, listConnections } = await import('@/lib/vault/connections');
    saveConnection(USER, 'email', 'Trabalho', { preset: 'gmail', user: 'a@x.com', password: 's' });
    saveConnection(USER, 'email', 'Pessoal', { preset: 'gmail', user: 'b@x.com', password: 's' });

    expect(listConnections(USER, 'email').map((c) => c.label)).toEqual(['Trabalho', 'Pessoal']);
  });

  it('não deixa um usuário enxergar a conexão do outro', async () => {
    const { saveConnection, listConnections, findConnection } = await import(
      '@/lib/vault/connections'
    );
    const id = saveConnection(USER, 'agenda', 'Pessoal', { icsUrl: 'https://exemplo/a.ics' });

    expect(listConnections(OTHER, 'agenda')).toEqual([]);
    expect(findConnection(OTHER, id)).toBeNull();
  });

  it('não deixa um usuário apagar a conexão do outro', async () => {
    const { saveConnection, deleteConnection, listConnections } = await import(
      '@/lib/vault/connections'
    );
    const id = saveConnection(USER, 'agenda', 'Pessoal', { icsUrl: 'https://exemplo/a.ics' });

    expect(deleteConnection(OTHER, id)).toBe(false);
    expect(listConnections(USER, 'agenda')).toHaveLength(1);
  });

  it('aplica os defaults do módulo ao gravar', async () => {
    const { saveConnection, listConnections } = await import('@/lib/vault/connections');
    saveConnection(USER, 'tasks', 'Tarefas', {});
    expect(listConnections(USER, 'tasks')[0].values.provider).toBe('local');
  });

  it('preserva o segredo quando a edição manda o campo em branco', async () => {
    const { saveConnection, findConnection } = await import('@/lib/vault/connections');
    const id = saveConnection(USER, 'jira', 'Jira', {
      cloud: 'acme',
      email: 'a@x.com',
      token: 'secreto',
    });

    saveConnection(USER, 'jira', 'Jira renomeado', { cloud: 'acme', email: 'a@x.com', token: '' }, id);

    const conn = findConnection(USER, id);
    expect(conn?.label).toBe('Jira renomeado');
    expect(conn?.values.token).toBe('secreto');
  });

  it('substitui o segredo quando a edição manda um valor novo', async () => {
    const { saveConnection, findConnection } = await import('@/lib/vault/connections');
    const id = saveConnection(USER, 'jira', 'Jira', { cloud: 'a', email: 'e', token: 'velho' });
    saveConnection(USER, 'jira', 'Jira', { cloud: 'a', email: 'e', token: 'novo' }, id);
    expect(findConnection(USER, id)?.values.token).toBe('novo');
  });
});

describe('resumo para a tela', () => {
  it('nunca devolve campo secreto, só o aviso de que existe', async () => {
    const { saveConnection, moduleStates } = await import('@/lib/vault/connections');
    saveConnection(USER, 'jira', 'Jira', { cloud: 'acme', email: 'a@x.com', token: 'secreto' });

    const jira = moduleStates(USER).find((m) => m.module === 'jira');
    const [conn] = jira!.connections;
    expect(conn.visible).toEqual({ cloud: 'acme', email: 'a@x.com' });
    expect(conn.secretsSet).toEqual(['token']);
    expect(JSON.stringify(jira)).not.toContain('secreto');
  });

  it('marca como ilegível a conexão que não abre com a chave atual', async () => {
    const { saveConnection, moduleStates, listConnections } = await import(
      '@/lib/vault/connections'
    );
    saveConnection(USER, 'agenda', 'Pessoal', { icsUrl: 'https://exemplo/a.ics' });
    process.env.DAILY_WEB_SECRET_KEY = Buffer.alloc(32, 9).toString('base64');

    const agenda = moduleStates(USER).find((m) => m.module === 'agenda');
    expect(agenda!.connections[0].unreadable).toBe(true);
    // A leitura de dados pula a conexão ilegível em vez de derrubar o painel.
    expect(listConnections(USER, 'agenda')).toEqual([]);
  });

  it('lista todos os módulos, configurados ou não', async () => {
    const { moduleStates } = await import('@/lib/vault/connections');
    expect(moduleStates(USER).map((m) => m.module)).toEqual([
      'email',
      'agenda',
      'jira',
      'pulls',
      'tasks',
    ]);
    expect(moduleStates(USER).every((m) => !m.configured)).toBe(true);
  });
});

describe('módulos ligados e desligados', () => {
  it('começa desligado para quem não configurou nada', async () => {
    const { isModuleEnabled, enabledModules } = await import('@/lib/vault/connections');
    expect(isModuleEnabled(USER, 'email')).toBe(false);
    // Tarefas é a exceção: funciona sem credencial, então o primeiro login
    // já tem um painel útil em vez de uma tela vazia.
    expect(enabledModules(USER)).toEqual(['tasks']);
  });

  it('deixa desligar o módulo que vem ligado por padrão', async () => {
    const { setModuleEnabled, isModuleEnabled } = await import('@/lib/vault/connections');
    setModuleEnabled(USER, 'tasks', false);
    expect(isModuleEnabled(USER, 'tasks')).toBe(false);
  });

  it('liga sozinho ao cadastrar a primeira conexão', async () => {
    const { saveConnection, isModuleEnabled } = await import('@/lib/vault/connections');
    saveConnection(USER, 'agenda', 'Pessoal', { icsUrl: 'https://exemplo/a.ics' });
    expect(isModuleEnabled(USER, 'agenda')).toBe(true);
  });

  it('respeita o desligamento explícito mesmo com conexão cadastrada', async () => {
    const { saveConnection, setModuleEnabled, isModuleEnabled, enabledModules } = await import(
      '@/lib/vault/connections'
    );
    saveConnection(USER, 'agenda', 'Pessoal', { icsUrl: 'https://exemplo/a.ics' });
    setModuleEnabled(USER, 'agenda', false);

    expect(isModuleEnabled(USER, 'agenda')).toBe(false);
    expect(enabledModules(USER)).toEqual(['tasks']);
  });

  it('não religa sozinho ao cadastrar a segunda conexão de um módulo desligado', async () => {
    const { saveConnection, setModuleEnabled, isModuleEnabled } = await import(
      '@/lib/vault/connections'
    );
    saveConnection(USER, 'email', 'A', { preset: 'gmail', user: 'a@x.com', password: 's' });
    setModuleEnabled(USER, 'email', false);
    saveConnection(USER, 'email', 'B', { preset: 'gmail', user: 'b@x.com', password: 's' });

    expect(isModuleEnabled(USER, 'email')).toBe(false);
  });

  it('mantém as configurações separadas por usuário', async () => {
    const { saveConnection, isModuleEnabled } = await import('@/lib/vault/connections');
    saveConnection(USER, 'agenda', 'Pessoal', { icsUrl: 'https://exemplo/a.ics' });
    expect(isModuleEnabled(OTHER, 'agenda')).toBe(false);
  });
});

describe('religar módulo ao conectar', () => {
  // Quem desligou a agenda porque o link iCal vivia falhando e depois
  // autoriza no Google espera ver o painel — não descobrir um interruptor.
  it('setModuleEnabled sobrepõe um desligamento anterior', async () => {
    const { setModuleEnabled, isModuleEnabled, saveConnection } = await import(
      '@/lib/vault/connections'
    );
    saveConnection(USER, 'agenda', 'Antiga', { icsUrl: 'https://exemplo/a.ics' });
    setModuleEnabled(USER, 'agenda', false);
    expect(isModuleEnabled(USER, 'agenda')).toBe(false);

    saveConnection(USER, 'agenda', 'Google Agenda', { provider: 'google', refreshToken: 'r' });
    setModuleEnabled(USER, 'agenda', true);

    expect(isModuleEnabled(USER, 'agenda')).toBe(true);
  });
});
