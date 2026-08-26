const encoder = new TextEncoder();

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = 'daily_web_session';

export interface SessionPayload {
  userId: string;
  user: string;
  issuedAt: number;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString('base64url');
}

function fromBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

export async function createSessionToken(
  userId: string,
  user: string,
  secret: string,
): Promise<string> {
  const payload: SessionPayload = { userId, user, issuedAt: Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  return `${payloadB64}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
  maxAgeMs: number,
): Promise<SessionPayload | null> {
  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return null;

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(sigB64) as any,
    encoder.encode(payloadB64),
  );
  if (!valid) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  // Cookie emitido antes do multiusuário não carrega userId. Aceitá-lo daria
  // uma sessão sem dono, que as fases seguintes não saberiam atribuir.
  if (typeof payload?.userId !== 'string' || payload.userId === '') return null;
  if (Date.now() - payload.issuedAt > maxAgeMs) return null;
  return payload;
}
