import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { createUser, listUsers } from '@/lib/auth/users';

// A lista nunca inclui o hash: um admin não precisa dele para administrar, e
// vazá-lo para o cliente daria material para quebrar a senha offline.
function publicView(user: { id: string; username: string; isAdmin: boolean; createdAt: string }) {
  return { id: user.id, username: user.username, isAdmin: user.isAdmin, createdAt: user.createdAt };
}

export async function GET() {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!current.isAdmin) return NextResponse.json({ error: 'apenas admin' }, { status: 403 });
  return NextResponse.json({ users: listUsers().map(publicView) });
}

export async function POST(request: NextRequest) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!current.isAdmin) return NextResponse.json({ error: 'apenas admin' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username) return NextResponse.json({ error: 'usuário obrigatório' }, { status: 400 });

  try {
    const user = await createUser(username, password, body?.isAdmin === true);
    return NextResponse.json({ user: publicView(user) }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
