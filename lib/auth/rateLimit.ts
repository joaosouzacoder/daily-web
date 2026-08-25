interface Attempt {
  count: number;
  resetAt: number;
}

// Traefik ANEXA o IP real do cliente ao X-Forwarded-For recebido (em vez de
// substituí-lo) — um cliente pode mandar qualquer valor forjado como
// primeira entrada, então só a ÚLTIMA entrada (a que o proxy anexou a partir
// da conexão TCP real) é confiável como chave do rate limit.
export function extractClientIp(xForwardedFor: string | null): string {
  if (!xForwardedFor) return 'unknown';
  const parts = xForwardedFor.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  return parts[parts.length - 1] ?? 'unknown';
}

const attempts = new Map<string, Attempt>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export function isRateLimited(ip: string): boolean {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function registerFailedAttempt(ip: string): void {
  const entry = attempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function clearAttempts(ip: string): void {
  attempts.delete(ip);
}
