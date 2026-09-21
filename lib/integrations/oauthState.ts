import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function signOAuthState(
  userId: string,
  purpose: string,
  secret: string,
  now = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, purpose, nonce: randomBytes(12).toString('base64url'), at: now }),
    'utf8',
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyOAuthState(
  state: string,
  secret: string,
  now = Date.now(),
): { userId: string; purpose: string } | null {
  const [payload, signature] = state.split('.');
  if (!payload || !signature) return null;

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const receivedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    receivedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(receivedBytes, expectedBytes)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId?: unknown;
      purpose?: unknown;
      at?: unknown;
    };
    if (
      typeof parsed.userId !== 'string' ||
      !parsed.userId ||
      typeof parsed.purpose !== 'string' ||
      !parsed.purpose ||
      typeof parsed.at !== 'number'
    ) {
      return null;
    }
    if (now - parsed.at > STATE_MAX_AGE_MS || parsed.at > now + 60_000) return null;
    return { userId: parsed.userId, purpose: parsed.purpose };
  } catch {
    return null;
  }
}
