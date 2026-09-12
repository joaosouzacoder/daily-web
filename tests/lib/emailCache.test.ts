import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('@/lib/integrations/imap', () => ({ fetchBodies: vi.fn() }));

import { fetchBodies } from '@/lib/integrations/imap';
import type { EmailEnvelope } from '@/lib/types';
import type { Connection } from '@/lib/vault/connections';

let dir: string;

const CONNECTION: Connection = {
  id: 'mail-1',
  module: 'email',
  label: 'Trabalho',
  values: { preset: 'gmail', user: 'a@x.com', password: 's' },
};

function envelope(over: Partial<EmailEnvelope>): EmailEnvelope {
  return {
    id: '1',
    account: CONNECTION.id,
    accountLabel: CONNECTION.label,
    from: 'Alguém',
    subject: 'Assunto',
    unread: true,
    date: '2026-08-25T10:00:00Z',
    messageId: '<a@b>',
    references: [],
    labels: [],
    mailbox: 'inbox' as const,
    folder: 'INBOX',
    ...over,
  };
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-cache-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('cache de corpos de e-mail', () => {
  it('devolve null quando o corpo ainda não foi guardado', async () => {
    const { getCachedBody } = await import('@/lib/emailCache');
    expect(getCachedBody('u-1', 'work', 'inexistente')).toBeNull();
  });

  it('guarda e recupera o corpo', async () => {
    const { putCachedBody, getCachedBody } = await import('@/lib/emailCache');
    putCachedBody('u-1', 'work', '42', 'corpo do e-mail');
    expect(getCachedBody('u-1', 'work', '42')).toBe('corpo do e-mail');
  });

  it('não confunde o mesmo id em contas diferentes', async () => {
    const { putCachedBody, getCachedBody } = await import('@/lib/emailCache');
    putCachedBody('u-1', 'mail-1', '42', 'do trabalho');
    putCachedBody('u-1', 'mail-2', '42', 'pessoal');
    expect(getCachedBody('u-1', 'mail-1', '42')).toBe('do trabalho');
    expect(getCachedBody('u-1', 'mail-2', '42')).toBe('pessoal');
  });

  it('sobrescreve o corpo quando o mesmo e-mail é guardado de novo', async () => {
    const { putCachedBody, getCachedBody } = await import('@/lib/emailCache');
    putCachedBody('u-1', 'work', '42', 'antigo');
    putCachedBody('u-1', 'work', '42', 'novo');
    expect(getCachedBody('u-1', 'work', '42')).toBe('novo');
  });

  it('só busca no IMAP o que ainda não está em cache', async () => {
    const { putCachedBody, warmBodyCache } = await import('@/lib/emailCache');
    putCachedBody('u-1', CONNECTION.id, '1', 'já tenho');
    vi.mocked(fetchBodies).mockResolvedValue([{ uid: '2', mailbox: 'inbox', body: 'baixado' }]);

    const fetched = await warmBodyCache('u-1', [CONNECTION], [
      envelope({ id: '1' }),
      envelope({ id: '2' }),
    ]);

    expect(fetched).toBe(1);
    // A caixa vai junto: o mesmo uid existe na entrada e nos enviados.
    expect(fetchBodies).toHaveBeenCalledWith(CONNECTION, [{ uid: '2', mailbox: 'inbox' }]);
  });

  // Uma conexão por mensagem faz o servidor recusar os logins seguintes, e é
  // isso que derrubava o e-mail no ciclo automático.
  it('pede todos os corpos que faltam numa chamada só por conta', async () => {
    const { warmBodyCache } = await import('@/lib/emailCache');
    const OUTRA: Connection = { ...CONNECTION, id: 'mail-2', label: 'Pessoal' };
    vi.mocked(fetchBodies).mockResolvedValue([]);

    await warmBodyCache(
      'u-1',
      [CONNECTION, OUTRA],
      [
        envelope({ id: '1' }),
        envelope({ id: '2', mailbox: 'sent' }),
        envelope({ id: '3', account: OUTRA.id }),
      ],
    );

    expect(fetchBodies).toHaveBeenCalledTimes(2);
    expect(fetchBodies).toHaveBeenCalledWith(CONNECTION, [
      { uid: '1', mailbox: 'inbox' },
      { uid: '2', mailbox: 'sent' },
    ]);
    expect(fetchBodies).toHaveBeenCalledWith(OUTRA, [{ uid: '3', mailbox: 'inbox' }]);
  });

  it('não passa de 15 corpos por conta em cada ciclo', async () => {
    const { warmBodyCache } = await import('@/lib/emailCache');
    vi.mocked(fetchBodies).mockResolvedValue([]);

    const muitos = Array.from({ length: 40 }, (_, i) => envelope({ id: String(i) }));
    await warmBodyCache('u-1', [CONNECTION], muitos);

    expect(vi.mocked(fetchBodies).mock.calls[0][1]).toHaveLength(15);
  });

  it('uma caixa que falha não interrompe o aquecimento das outras', async () => {
    const { warmBodyCache, getCachedBody } = await import('@/lib/emailCache');
    const OUTRA: Connection = { ...CONNECTION, id: 'mail-2', label: 'Pessoal' };
    vi.mocked(fetchBodies).mockImplementation(async (conn) => {
      if (conn.id === CONNECTION.id) throw new Error('IMAP caiu');
      return [{ uid: '2', mailbox: 'inbox' as const, body: 'ok' }];
    });

    const fetched = await warmBodyCache(
      'u-1',
      [CONNECTION, OUTRA],
      [envelope({ id: '1' }), envelope({ id: '2', account: OUTRA.id })],
    );

    expect(fetched).toBe(1);
    expect(getCachedBody('u-1', CONNECTION.id, '1')).toBeNull();
    expect(getCachedBody('u-1', OUTRA.id, '2')).toBe('ok');
  });

  // O envelope aponta para a caixa por id. Se a conexão foi removida entre o
  // refresh e o aquecimento, não há credencial para buscar o corpo.
  it('ignora envelope de uma caixa que não está mais na lista', async () => {
    const { warmBodyCache } = await import('@/lib/emailCache');
    vi.mocked(fetchBodies).mockResolvedValue([]);

    const fetched = await warmBodyCache('u-1', [], [envelope({ id: '1' })]);

    expect(fetched).toBe(0);
    expect(fetchBodies).not.toHaveBeenCalled();
  });

  it('não devolve para um usuário o corpo cacheado por outro', async () => {
    const { putCachedBody, getCachedBody } = await import('@/lib/emailCache');
    putCachedBody('u-1', CONNECTION.id, '42', 'meu corpo');
    expect(getCachedBody('u-2', CONNECTION.id, '42')).toBeNull();
  });

  it('descarta corpos com mais de 30 dias e preserva os recentes', async () => {
    const { putCachedBody, pruneOldBodies, getCachedBody } = await import('@/lib/emailCache');
    const { getDb } = await import('@/lib/db');

    putCachedBody('u-1', 'work', 'antigo', 'velho');
    putCachedBody('u-1', 'work', 'novo', 'recente');
    getDb()
      .prepare('UPDATE email_bodies SET cached_at = ? WHERE message_id = ?')
      .run('2026-01-01T00:00:00.000Z', 'antigo');

    const removed = pruneOldBodies(new Date('2026-08-25T12:00:00Z'));

    expect(removed).toBe(1);
    expect(getCachedBody('u-1', 'work', 'antigo')).toBeNull();
    expect(getCachedBody('u-1', 'work', 'novo')).toBe('recente');
  });
});

describe('caixa na chave do cache', () => {
  // O uid do IMAP é por caixa: sem isto, o corpo de uma enviada seria
  // devolvido no lugar do de uma recebida com o mesmo número.
  it('o mesmo uid em caixas diferentes guarda corpos diferentes', async () => {
    const { getCachedBody, putCachedBody } = await import('@/lib/emailCache');

    putCachedBody('u-1', 'mail-1', '42', 'corpo da recebida', 'inbox');
    putCachedBody('u-1', 'mail-1', '42', 'corpo da enviada', 'sent');

    expect(getCachedBody('u-1', 'mail-1', '42', 'inbox')).toBe('corpo da recebida');
    expect(getCachedBody('u-1', 'mail-1', '42', 'sent')).toBe('corpo da enviada');
  });

  it('a entrada é o padrão de quem não informa a caixa', async () => {
    const { getCachedBody, putCachedBody } = await import('@/lib/emailCache');
    putCachedBody('u-1', 'mail-1', '7', 'corpo');
    expect(getCachedBody('u-1', 'mail-1', '7')).toBe('corpo');
    expect(getCachedBody('u-1', 'mail-1', '7', 'sent')).toBeNull();
  });

  it('não confunde caixas de contas diferentes', async () => {
    const { getCachedBody, putCachedBody } = await import('@/lib/emailCache');
    putCachedBody('u-1', 'mail-1', '9', 'da conta 1', 'sent');
    expect(getCachedBody('u-1', 'mail-2', '9', 'sent')).toBeNull();
  });
});
