import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { removeUser, setUserPassword } from '@/lib/auth/users';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!current.isAdmin) return NextResponse.json({ error: 'apenas admin' }, { status: 403 });

  const { username } = await params;
  // Remover a si mesmo derruba a própria sessão no meio da administração.
  if (username === current.username) {
    return NextResponse.json({ error: 'não é possível remover a si mesmo' }, { status: 400 });
  }

  try {
    if (!removeUser(username)) {
      return NextResponse.json({ error: 'usuário não encontrado' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { username } = await params;
  // Trocar a própria senha não exige admin; a de outra pessoa, sim.
  if (username !== current.username && !current.isAdmin) {
    return NextResponse.json({ error: 'apenas admin' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';

  try {
    if (!(await setUserPassword(username, password))) {
      return NextResponse.json({ error: 'usuário não encontrado' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
