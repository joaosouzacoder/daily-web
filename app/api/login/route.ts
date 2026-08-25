import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, verifyUsername } from '@/lib/auth/password';
import { createSessionToken } from '@/lib/auth/session';
import { isRateLimited, registerFailedAttempt, clearAttempts, extractClientIp } from '@/lib/auth/rateLimit';

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function POST(request: NextRequest) {
  const ip = extractClientIp(request.headers.get('x-forwarded-for'));
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'muitas tentativas, tente mais tarde' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === 'string' ? body.username : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  const expectedUser = process.env.DASHBOARD_USER ?? '';
  const expectedHash = process.env.DASHBOARD_PASSWORD_HASH ?? '';
  const secret = process.env.SESSION_SECRET ?? '';

  if (!expectedUser || !expectedHash || !secret) {
    return NextResponse.json({ error: 'servidor sem configuração de autenticação' }, { status: 500 });
  }

  const ok = verifyUsername(username, expectedUser) && (await verifyPassword(password, expectedHash));
  if (!ok) {
    registerFailedAttempt(ip);
    return NextResponse.json({ error: 'usuário ou senha inválidos' }, { status: 401 });
  }

  clearAttempts(ip);
  const token = await createSessionToken(username, secret);
  const response = NextResponse.json({ ok: true });
  response.cookies.set('daily_web_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
  return response;
}
