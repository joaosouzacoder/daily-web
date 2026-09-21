const AUTH_URL = 'https://slack.com/oauth/v2/authorize';
const TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

export const SLACK_USER_SCOPES = ['search:read', 'im:read', 'im:history', 'users:read'] as const;

interface SlackOAuthResponse {
  ok?: boolean;
  error?: string;
  authed_user?: {
    id?: string;
    scope?: string;
    access_token?: string;
  };
  team?: { id?: string; name?: string };
}

export interface SlackExchangeResult {
  token: string;
  userId: string;
  teamId: string;
  teamName: string;
  scope: string;
}

export function isSlackConfigured(): boolean {
  return Boolean(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET);
}

export function slackRedirectUri(): string {
  const origin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:8010';
  return `${origin.replace(/\/+$/, '')}/api/integrations/slack/callback`;
}

function slackClient(): { clientId: string; clientSecret: string } {
  const clientId = process.env.SLACK_CLIENT_ID ?? '';
  const clientSecret = process.env.SLACK_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) {
    throw new Error(
      'a conexão com o Slack não está configurada neste servidor (SLACK_CLIENT_ID e SLACK_CLIENT_SECRET)',
    );
  }
  return { clientId, clientSecret };
}

export function slackAuthorizationUrl(state: string): string {
  const { clientId } = slackClient();
  const params = new URLSearchParams({
    client_id: clientId,
    user_scope: SLACK_USER_SCOPES.join(','),
    redirect_uri: slackRedirectUri(),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeSlackCode(code: string): Promise<SlackExchangeResult> {
  const { clientId, clientSecret } = slackClient();
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ code, redirect_uri: slackRedirectUri() }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`o Slack recusou a autorização: HTTP ${response.status}`);
  const data = (await response.json()) as SlackOAuthResponse;
  if (!data.ok) {
    throw new Error(`o Slack recusou a autorização: ${data.error ?? `HTTP ${response.status}`}`);
  }
  const token = data.authed_user?.access_token;
  if (!token) throw new Error('o Slack não devolveu um token de acesso');
  return {
    token,
    userId: data.authed_user?.id ?? '',
    teamId: data.team?.id ?? '',
    teamName: data.team?.name ?? '',
    scope: data.authed_user?.scope ?? '',
  };
}
