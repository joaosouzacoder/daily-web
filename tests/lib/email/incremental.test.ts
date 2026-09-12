import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('@/lib/integrations/imap', () => ({
  fetchFolderChanges: vi.fn(),
  fetchInboxAndSent: vi.fn(),
}));

import { fetchFolderChanges } from '@/lib/integrations/imap';
import type { Connection } from '@/lib/vault/connections';
import type { EmailEnvelope } from '@/lib/types';

const ME = 'u-1';
const CONN = { id: 'mail-1', label: 'Trabalho', module: 'email', values: {} } as unknown as Connection;

let dir: string;

function envelope(uid: string, over: Partial<EmailEnvelope> = {}): EmailEnvelope {
  return {
    id: uid,
    account: CONN.id,
    accountLabel: 'Trabalho',
    from: 'Alguém',
    subject: `Assunto ${uid}`,
    unread: true,
    date: `2026-09-${uid.padStart(2, '0')}T10:00:00Z`,
    messageId: `<${uid}@b>`,
    references: [],
    labels: [],
    mailbox: 'inbox',
    folder: 'INBOX',
    ...over,
  };
}

function changes(over: Record<string, unknown> = {}) {
  return {
    uidvalidity: '100',
    added: [],
    flags: [],
    windowFrom: '1',
    total: 0,
    ...over,
  };
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-incremental-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  process.env.DAILY_WEB_SECRET_KEY = Buffer.alloc(32, 11).toString('base64');
  vi.clearAllMocks();
  const { getDb } = await import('@/lib/db');
  getDb();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('sincronização por diferença', () => {
  // A primeira leitura não tem de onde partir: ela traz as recentes.
  it('pede as recentes quando a pasta nunca foi lida', async () => {
    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({ added: [envelope('10'), envelope('11')], flags: [], total: 2 }) as never,
    );
    const { syncFolder } = await import('@/lib/email/sync');

    const resultado = await syncFolder(ME, CONN, 'INBOX', 50);

    expect(vi.mocked(fetchFolderChanges).mock.calls[0][2]).toBeNull();
    expect(resultado.envelopes.map((e) => e.id).sort()).toEqual(['10', '11']);
  });

  // O ciclo relia a caixa inteira a cada dez minutos para descobrir que nada
  // tinha mudado. Agora ele parte do último uid que já conhece.
  it('pede só o que chegou depois do último uid na segunda leitura', async () => {
    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({ added: [envelope('10'), envelope('11')], total: 2 }) as never,
    );
    const { syncFolder } = await import('@/lib/email/sync');
    await syncFolder(ME, CONN, 'INBOX', 50);

    // A janela recente continua reportando as que já estão guardadas — é ela
    // que diz o que ainda está lá — mas nenhuma delas é buscada de novo.
    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({
        added: [envelope('12')],
        flags: [
          { uid: '10', unread: true, labels: [] },
          { uid: '11', unread: true, labels: [] },
          { uid: '12', unread: true, labels: [] },
        ],
        total: 3,
      }) as never,
    );
    const resultado = await syncFolder(ME, CONN, 'INBOX', 50);

    expect(vi.mocked(fetchFolderChanges).mock.calls[1][2]).toBe('11');
    expect(resultado.added).toBe(1);
    // O que já estava guardado continua na lista sem ter sido pedido de novo.
    expect(resultado.envelopes.map((e) => e.id).sort()).toEqual(['10', '11', '12']);
  });

  it('não busca nada quando nada chegou', async () => {
    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({ added: [envelope('10')], total: 1 }) as never,
    );
    const { syncFolder } = await import('@/lib/email/sync');
    await syncFolder(ME, CONN, 'INBOX', 50);

    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({ added: [], flags: [{ uid: '10', unread: true, labels: [] }], total: 1 }) as never,
    );
    const resultado = await syncFolder(ME, CONN, 'INBOX', 50);

    expect(resultado.added).toBe(0);
    expect(resultado.envelopes).toHaveLength(1);
  });
});

describe('reconferência da janela recente', () => {
  // Lido em outro cliente precisa aparecer aqui sem a caixa ser relida.
  it('atualiza a marca de lido pelo que a janela disse', async () => {
    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({ added: [envelope('10')], total: 1 }) as never,
    );
    const { syncFolder } = await import('@/lib/email/sync');
    await syncFolder(ME, CONN, 'INBOX', 50);

    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({ added: [], flags: [{ uid: '10', unread: false, labels: ['Clientes'] }] }) as never,
    );
    const resultado = await syncFolder(ME, CONN, 'INBOX', 50);

    expect(resultado.envelopes[0]).toMatchObject({ unread: false, labels: ['Clientes'] });
  });

  // Apagada em outro cliente: ela não vem na janela, e ausência ali é
  // evidência de que ela não está mais lá.
  it('tira a mensagem que sumiu da janela', async () => {
    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({ added: [envelope('10'), envelope('11')], total: 2 }) as never,
    );
    const { syncFolder } = await import('@/lib/email/sync');
    await syncFolder(ME, CONN, 'INBOX', 50);

    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({ added: [], flags: [{ uid: '11', unread: true, labels: [] }], windowFrom: '1' }) as never,
    );
    const resultado = await syncFolder(ME, CONN, 'INBOX', 50);

    expect(resultado.envelopes.map((e) => e.id)).toEqual(['11']);
  });

  // Fora da janela ninguém perguntou: concluir dali que a mensagem sumiu
  // apagaria da tela o que continua na caixa.
  it('não conclui nada sobre o que está fora da janela', async () => {
    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({ added: [envelope('10'), envelope('900')], total: 2 }) as never,
    );
    const { syncFolder } = await import('@/lib/email/sync');
    await syncFolder(ME, CONN, 'INBOX', 50);

    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({
        added: [],
        flags: [{ uid: '900', unread: true, labels: [] }],
        windowFrom: '800',
      }) as never,
    );
    const resultado = await syncFolder(ME, CONN, 'INBOX', 50);

    expect(resultado.envelopes.map((e) => e.id).sort()).toEqual(['10', '900']);
  });
});

describe('reindexação da pasta', () => {
  // O servidor reiniciou a numeração: os uids guardados passaram a apontar
  // para outras mensagens e nada do que havia serve.
  it('descarta o que estava guardado e lê a pasta de novo', async () => {
    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({ added: [envelope('10')], total: 1 }) as never,
    );
    const { syncFolder } = await import('@/lib/email/sync');
    await syncFolder(ME, CONN, 'INBOX', 50);

    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({ uidvalidity: '200', added: [envelope('1')], total: 1 }) as never,
    );
    const resultado = await syncFolder(ME, CONN, 'INBOX', 50);

    expect(resultado.reindexed).toBe(true);
    expect(resultado.envelopes.map((e) => e.id)).toEqual(['1']);
  });

  it('faz falhar à vista a ação que dependia da numeração antiga', async () => {
    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({ added: [envelope('10')], total: 1 }) as never,
    );
    const { syncFolder } = await import('@/lib/email/sync');
    await syncFolder(ME, CONN, 'INBOX', 50);

    const { recordPendingAction, listPendingActions } = await import('@/lib/email/pendingActions');
    recordPendingAction({
      userId: ME,
      account: CONN.id,
      uid: '10',
      kind: 'delete',
      uidvalidity: '100',
    });

    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({ uidvalidity: '200', added: [envelope('1')], total: 1 }) as never,
    );
    await syncFolder(ME, CONN, 'INBOX', 50);

    const pendentes = listPendingActions(ME);
    expect(pendentes[0].state).toBe('failed');
    expect(pendentes[0].lastError).toMatch(/reindexada/);
  });
});

describe('nada sem limite', () => {
  it('mantém a pasta guardada dentro do teto', async () => {
    const muitas = Array.from({ length: 400 }, (_, i) => envelope(String(i + 1)));
    vi.mocked(fetchFolderChanges).mockResolvedValue(
      changes({ added: muitas, total: 400 }) as never,
    );
    const { syncFolder } = await import('@/lib/email/sync');
    await syncFolder(ME, CONN, 'INBOX', 50);

    const { listStoredMessages } = await import('@/lib/email/messages');
    expect(listStoredMessages(ME, CONN.id, 'INBOX', '100', 1000)).toHaveLength(300);
  });
});

describe('uma conexão por conta a cada ciclo', () => {
  // Duas conexões por conta custavam um login a mais, e o login é a parte
  // cara da ida: o ciclo ficou mais lento do que era antes da mudança.
  it('traz a entrada e os enviados numa ida só', async () => {
    const { fetchInboxAndSent } = await import('@/lib/integrations/imap');
    vi.mocked(fetchInboxAndSent).mockResolvedValue({
      changes: changes({ added: [envelope('10')], total: 1 }) as never,
      sent: [envelope('99', { mailbox: 'sent', folder: 'Sent' })],
    });

    const { loadInbox } = await import('@/lib/email/inbox');
    const lista = await loadInbox(ME, CONN, 30);

    expect(fetchInboxAndSent).toHaveBeenCalledTimes(1);
    expect(fetchFolderChanges).not.toHaveBeenCalled();
    expect(lista.map((e) => e.id).sort()).toEqual(['10', '99']);
  });
});
