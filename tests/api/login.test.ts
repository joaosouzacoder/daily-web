import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/auth/password', () => ({
  verifyUsername: vi.fn(() => false),
  verifyPassword: vi.fn(async () => false),
}));

import { clearAttempts } from '@/lib/auth/rateLimit';
import { POST as loginRoute } from '@/app/api/login/route';

const REAL_IP = '203.0.113.42';
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.DASHBOARD_USER = 'joao';
  process.env.DASHBOARD_PASSWORD_HASH = 'hash';
  process.env.SESSION_SECRET = 'segredo-de-teste';
  clearAttempts(REAL_IP);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  clearAttempts(REAL_IP);
});

function loginRequest(xForwardedFor: string): Request {
  return new Request('http://localhost/api/login', {
    method: 'POST',
    headers: { 'x-forwarded-for': xForwardedFor, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'joao', password: 'senha-errada' }),
  });
}

describe('POST /api/login — rate limit resistente a X-Forwarded-For forjado', () => {
  it('bloqueia após 5 tentativas mesmo quando o cliente varia a entrada forjável do X-Forwarded-For a cada tentativa', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await loginRoute(loginRequest(`forjado-${i}, ${REAL_IP}`));
      expect(res.status).toBe(401);
    }
    const res = await loginRoute(loginRequest(`forjado-outro, ${REAL_IP}`));
    expect(res.status).toBe(429);
  });

  it('IPs reais diferentes (última entrada) continuam com limites independentes', async () => {
    for (let i = 0; i < 5; i += 1) {
      await loginRoute(loginRequest(`x, ${REAL_IP}`));
    }
    const res = await loginRoute(loginRequest('x, 198.51.100.9'));
    expect(res.status).toBe(401);
  });
});
