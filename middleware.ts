import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_MAX_AGE_MS, SESSION_COOKIE } from '@/lib/auth/session';

const PUBLIC_PATHS = ['/login', '/api/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  // Fail closed: sem SESSION_SECRET configurado, nenhum token pode ser
  // considerado válido — verificar contra um segredo vazio aceitaria
  // qualquer token forjado com esse mesmo segredo vazio, conhecido.
  const session = token && secret ? await verifySessionToken(token, secret, SESSION_MAX_AGE_MS) : null;

  if (!session) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
    }
    const publicOrigin = process.env.PUBLIC_ORIGIN;
    const loginUrl = publicOrigin ? new URL('/login', publicOrigin) : new URL('/login', request.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export const runtime = 'nodejs';
