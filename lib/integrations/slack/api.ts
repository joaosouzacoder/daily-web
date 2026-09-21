interface SlackResponse {
  ok?: boolean;
  error?: string;
}

function slackError(code: string): string {
  if (['invalid_auth', 'token_revoked', 'account_inactive'].includes(code)) {
    return 'o Slack recusou o acesso — reconecte o Slack';
  }
  if (code === 'missing_scope') return 'falta permissão no Slack — reconecte o Slack';
  return `Slack respondeu ${code}`;
}

export async function slackCall<T extends SlackResponse>(
  token: string,
  method: string,
  params: Record<string, string>,
): Promise<T> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 429) {
    const seconds = response.headers.get('retry-after') ?? '?';
    throw new Error(`o Slack pediu para esperar ${seconds}s`);
  }
  // O status vem antes do corpo: um 5xx pode trazer uma página HTML, e ler
  // isso como JSON esconderia o que aconteceu atrás de um erro de sintaxe.
  if (!response.ok) throw new Error(`Slack respondeu HTTP ${response.status}`);
  const data = (await response.json()) as T;
  if (!data.ok) throw new Error(slackError(data.error ?? 'erro desconhecido'));
  return data;
}
