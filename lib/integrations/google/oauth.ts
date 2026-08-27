import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// O client OAuth é da instância, não de cada pessoa. Quem sobe o servidor cria
// um (grátis) uma vez; quem usa só clica em "Conectar". A alternativa — cada
// usuário criando o próprio projeto no Google Cloud — funciona, mas é mais
// trabalho do que todo o resto da app somado.
//
// Não há custo envolvido: a verificação paga do Google (CASA) só é exigida
// para publicar um app que acessa contas de terceiros em escala. Um app não
// verificado atende até 100 contas, que é muito mais do que esta app comporta.

// `email` acompanha o escopo da agenda para sabermos *qual* conta autorizou.
// Sem isso não dá para distinguir "reconectei a mesma conta" de "adicionei
// outra", e a segunda sobrescrevia a primeira.
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
export const OAUTH_SCOPES = `${CALENDAR_SCOPE} openid email`;
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super(
      'a conexão com o Google não está configurada neste servidor (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET)',
    );
    this.name = 'GoogleNotConfiguredError';
  }
}

export function redirectUri(): string {
  const origin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:8010';
  return `${origin.replace(/\/+$/, '')}/api/integrations/agenda/google/callback`;
}

export function googleClient(): GoogleClient {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) throw new GoogleNotConfiguredError();
  return { clientId, clientSecret, redirectUri: redirectUri() };
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * O `state` do OAuth é a defesa contra alguém induzir você a concluir um fluxo
 * que não começou aqui. Ele é assinado com o SESSION_SECRET e carrega o id do
 * usuário: no retorno, além da assinatura conferir, o dono da sessão precisa
 * ser o mesmo que iniciou.
 */
export function signState(userId: string, secret: string, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, nonce: randomBytes(12).toString('base64url'), at: now }),
    'utf8',
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyState(
  state: string,
  secret: string,
  now = Date.now(),
): { userId: string } | null {
  const [payload, signature] = state.split('.');
  if (!payload || !signature) return null;

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId?: string;
      at?: number;
    };
    if (!parsed.userId || typeof parsed.at !== 'number') return null;
    if (now - parsed.at > STATE_MAX_AGE_MS || parsed.at > now + 60_000) return null;
    return { userId: parsed.userId };
  } catch {
    return null;
  }
}

export function authorizationUrl(client: GoogleClient, state: string, loginHint?: string): string {
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPES,
    // `offline` + `consent` são o que garante um refresh token: sem os dois, a
    // segunda autorização volta sem ele e a conexão morre em uma hora.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await response.json()) as TokenResponse;
  if (!response.ok || data.error) {
    throw new Error(describeTokenError(data));
  }
  return data;
}

export function describeTokenError(data: TokenResponse): string {
  if (data.error === 'invalid_grant') {
    return 'o Google recusou a autorização — ela pode ter expirado ou sido revogada. Conecte de novo';
  }
  if (data.error === 'redirect_uri_mismatch') {
    return `o endereço de retorno não está registrado no Google. Adicione ${redirectUri()} nas URIs de redirecionamento autorizadas do client OAuth`;
  }
  if (data.error === 'invalid_client') {
    return 'GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET estão errados';
  }
  return data.error_description ?? data.error ?? 'falha ao falar com o Google';
}

export interface ExchangeResult {
  refreshToken: string;
  accessToken: string;
}

/** O e-mail da conta que autorizou. É a identidade da conexão: é por ele que
 *  reconectar atualiza em vez de criar uma segunda agenda. */
export async function accountEmail(accessToken: string): Promise<string> {
  const response = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return '';
  const data = (await response.json()) as { email?: string };
  return data.email ?? '';
}

export async function exchangeCode(client: GoogleClient, code: string): Promise<ExchangeResult> {
  const data = await tokenRequest(
    new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: client.redirectUri,
      grant_type: 'authorization_code',
    }),
  );

  if (!data.refresh_token) {
    throw new Error(
      'o Google não devolveu um token de atualização. Remova o acesso desta app em myaccount.google.com/permissions e conecte de novo',
    );
  }
  return { refreshToken: data.refresh_token, accessToken: data.access_token ?? '' };
}

// Um access token vale uma hora. Guardar só o refresh token e trocar quando
// precisa é mais simples — e mais seguro — do que manter o par sincronizado.
export async function accessToken(client: GoogleClient, refreshToken: string): Promise<string> {
  const data = await tokenRequest(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      grant_type: 'refresh_token',
    }),
  );
  if (!data.access_token) throw new Error('o Google não devolveu um token de acesso');
  return data.access_token;
}
