import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exchangeSlackCode,
  slackAuthorizationUrl,
  SLACK_USER_SCOPES,
} from '@/lib/integrations/slack/oauth';

const original = { ...process.env };

beforeEach(() => {
  process.env.SLACK_CLIENT_ID = 'cliente';
  process.env.SLACK_CLIENT_SECRET = 'segredo';
  process.env.PUBLIC_ORIGIN = 'https://painel.exemplo/';
});

afterEach(() => {
  process.env = { ...original };
  vi.restoreAllMocks();
});

describe('OAuth do Slack', () => {
  it('usa user_scope com exatamente os quatro escopos e a URI de retorno', () => {
    const url = new URL(slackAuthorizationUrl('estado'));
    expect(url.searchParams.has('scope')).toBe(false);
    expect(url.searchParams.get('user_scope')?.split(',')).toEqual([...SLACK_USER_SCOPES]);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://painel.exemplo/api/integrations/slack/callback',
    );
  });

  it('troca o código com Basic auth e mapeia o usuário autorizado', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          authed_user: { id: 'U1', scope: 'search:read', access_token: 'xoxp-token' },
          team: { id: 'T1', name: 'Equipe' },
        }),
      ),
    );
    await expect(exchangeSlackCode('codigo')).resolves.toEqual({
      token: 'xoxp-token',
      userId: 'U1',
      teamId: 'T1',
      teamName: 'Equipe',
      scope: 'search:read',
    });
    const init = fetchMock.mock.calls[0][1];
    expect(new Headers(init?.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('cliente:segredo').toString('base64')}`,
    );
    const body = new URLSearchParams(String(init?.body));
    expect(body.get('code')).toBe('codigo');
    expect(body.get('redirect_uri')).toContain('/api/integrations/slack/callback');
  });

  it('explica a falha devolvida pelo Slack', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'invalid_code' })),
    );
    await expect(exchangeSlackCode('ruim')).rejects.toThrow('invalid_code');
  });
});
