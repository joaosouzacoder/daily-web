import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('@/lib/cli/himalaya', () => ({ fetchBody: vi.fn() }));

import { fetchBody } from '@/lib/cli/himalaya';
import type { EmailEnvelope } from '@/lib/types';

let dir: string;

function envelope(over: Partial<EmailEnvelope>): EmailEnvelope {
  return {
    id: '1',
    account: 'work',
    from: 'Alguém',
    subject: 'Assunto',
    unread: true,
    date: '2026-08-25T10:00:00Z',
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
    putCachedBody('u-1', 'work', '42', 'do trabalho');
    putCachedBody('u-1', 'personal', '42', 'pessoal');
    expect(getCachedBody('u-1', 'work', '42')).toBe('do trabalho');
    expect(getCachedBody('u-1', 'personal', '42')).toBe('pessoal');
  });

  it('sobrescreve o corpo quando o mesmo e-mail é guardado de novo', async () => {
    const { putCachedBody, getCachedBody } = await import('@/lib/emailCache');
    putCachedBody('u-1', 'work', '42', 'antigo');
    putCachedBody('u-1', 'work', '42', 'novo');
    expect(getCachedBody('u-1', 'work', '42')).toBe('novo');
  });

  it('só busca no IMAP o que ainda não está em cache', async () => {
    const { putCachedBody, warmBodyCache } = await import('@/lib/emailCache');
    putCachedBody('u-1', 'work', '1', 'já tenho');
    vi.mocked(fetchBody).mockResolvedValue('baixado');

    const fetched = await warmBodyCache('u-1', [
      envelope({ id: '1' }),
      envelope({ id: '2' }),
    ]);

    expect(fetched).toBe(1);
    expect(fetchBody).toHaveBeenCalledTimes(1);
    expect(fetchBody).toHaveBeenCalledWith('work', '2');
  });

  it('um e-mail que falha não interrompe o aquecimento dos outros', async () => {
    const { warmBodyCache, getCachedBody } = await import('@/lib/emailCache');
    vi.mocked(fetchBody).mockImplementation(async (_account, id) => {
      if (id === '1') throw new Error('IMAP caiu');
      return 'ok';
    });

    const fetched = await warmBodyCache('u-1', [envelope({ id: '1' }), envelope({ id: '2' })]);

    expect(fetched).toBe(1);
    expect(getCachedBody('u-1', 'work', '1')).toBeNull();
    expect(getCachedBody('u-1', 'work', '2')).toBe('ok');
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
