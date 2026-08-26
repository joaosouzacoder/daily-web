import { NextResponse } from 'next/server';
import { editSubtask, checkSubtask, deleteSubtask } from '@/lib/tasks';
import { isValidTaskId, isSafePositionalValue } from '@/lib/api/validation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { refreshTasks } from '@/lib/refresher';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  if (!isValidTaskId(id) || !isValidTaskId(itemId)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  const body = await request.json();
  if (typeof body.title === 'string' && body.title.trim() && !isSafePositionalValue(body.title.trim())) {
    return NextResponse.json({ error: 'título inválido' }, { status: 400 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    if (typeof body.completed === 'boolean') {
      await checkSubtask(user.id, id, itemId, body.completed);
    }
    if (typeof body.title === 'string' && body.title.trim()) {
      await editSubtask(user.id, id, itemId, body.title.trim());
    }
    await refreshTasks(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  if (!isValidTaskId(id) || !isValidTaskId(itemId)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    await deleteSubtask(user.id, id, itemId);
    await refreshTasks(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
