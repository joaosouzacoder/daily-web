import { NextResponse } from 'next/server';
import { addSubtask } from '@/lib/tasks';
import { isValidTaskId, isSafePositionalValue } from '@/lib/api/validation';
import { getCurrentUser } from '@/lib/auth/currentUser';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidTaskId(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  const body = await request.json();
  const title: string = body.title ?? '';
  if (!title.trim()) {
    return NextResponse.json({ error: 'título obrigatório' }, { status: 400 });
  }
  if (!isSafePositionalValue(title.trim())) {
    return NextResponse.json({ error: 'título inválido' }, { status: 400 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    await addSubtask(user.id, id, title.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
