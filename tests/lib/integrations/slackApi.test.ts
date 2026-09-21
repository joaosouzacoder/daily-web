import { afterEach, describe, expect, it, vi } from 'vitest';
import { slackCall } from '@/lib/integrations/slack/api';

afterEach(() => vi.restoreAllMocks());

describe('API do Slack', () => {
  it('informa quantos segundos o Slack pediu para esperar', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('', { status: 429, headers: { 'Retry-After': '37' } }),
    );
    await expect(slackCall('xoxp-segredo', 'auth.test', {})).rejects.toThrow(
      'o Slack pediu para esperar 37s',
    );
  });

  it('pede reconexão quando o token foi revogado sem expor o token', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'token_revoked' })),
    );
    const error = await slackCall('xoxp-segredo', 'auth.test', {}).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('reconecte o Slack');
    expect((error as Error).message).not.toContain('xoxp-segredo');
  });

  // Um 5xx pode vir com uma página HTML; ler como JSON trocaria o status
  // real por um erro de sintaxe incompreensível.
  it('diz o status HTTP quando o Slack responde com erro fora do JSON', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('<html>Bad Gateway</html>', { status: 502 }),
    );
    await expect(slackCall('token', 'auth.test', {})).rejects.toThrow('Slack respondeu HTTP 502');
  });

  it('pede reconexão com a permissão que falta', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'missing_scope' })),
    );
    await expect(slackCall('token', 'auth.test', {})).rejects.toThrow(
      'falta permissão no Slack — reconecte o Slack',
    );
  });
});
