import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth/session';

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PUBLIC_PATHS = ['/login', '/api/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  const token = request.cookies.get('daily_web_session')?.value;
  const secret = process.env.SESSION_SECRET ?? '';
  const session = token ? await verifySessionToken(token, secret, SESSION_MAX_AGE_MS) : null;

  if (!session) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export const runtime = 'nodejs';
