import { describe, expect, it, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/lib/auth/session';
import { middleware } from '@/middleware';

const ORIGINAL_SECRET = process.env.SESSION_SECRET;

afterEach(() => {
  process.env.SESSION_SECRET = ORIGINAL_SECRET;
});

function makeRequest(pathname: string, token?: string): NextRequest {
  const headers = new Headers();
  if (token) headers.set('cookie', `daily_web_session=${token}`);
  return new NextRequest(new URL(`http://localhost${pathname}`), { headers });
}

// crypto.subtle.importKey rejeita chave HMAC de tamanho zero (por isso
// createSessionToken('', ...) não pode ser usado aqui para forjar o token) —
// mas HMAC-SHA256 com chave vazia é perfeitamente válido fora do WebCrypto
// (ex.: node:crypto ou openssl), então um atacante consegue forjar um token
// assim caso descubra que SESSION_SECRET está vazio.
function forgeTokenWithEmptySecret(user: string): string {
  const payloadB64 = Buffer.from(JSON.stringify({ user, issuedAt: Date.now() }), 'utf8').toString(
    'base64url',
  );
  const sig = createHmac('sha256', '').update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

describe('middleware', () => {
  it('deixa passar uma requisição de API com token válido quando SESSION_SECRET está configurado', async () => {
    process.env.SESSION_SECRET = 'real-secret';
    const token = await createSessionToken('u-1', 'joao', 'real-secret');
    const res = await middleware(makeRequest('/api/tasks', token));
    expect(res.status).toBe(200);
  });

  it('falha fechado (401) em rota de API quando SESSION_SECRET está ausente, mesmo com token forjado com segredo vazio', async () => {
    process.env.SESSION_SECRET = '';
    const forgedToken = forgeTokenWithEmptySecret('attacker');
    const res = await middleware(makeRequest('/api/tasks', forgedToken));
    expect(res.status).toBe(401);
  });

  it('redireciona para /login em rota de página quando SESSION_SECRET está ausente, mesmo com token forjado com segredo vazio', async () => {
    process.env.SESSION_SECRET = '';
    const forgedToken = forgeTokenWithEmptySecret('attacker');
    const res = await middleware(makeRequest('/', forgedToken));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('nega acesso a rota de API sem nenhum token, independentemente do segredo', async () => {
    process.env.SESSION_SECRET = 'real-secret';
    const res = await middleware(makeRequest('/api/tasks'));
    expect(res.status).toBe(401);
  });
});
