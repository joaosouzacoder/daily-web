import { NextResponse } from 'next/server';
import { editSubtask, checkSubtask, deleteSubtask } from '@/lib/cli/mstodo';
import { isValidTaskId } from '@/lib/api/validation';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  if (!isValidTaskId(id) || !isValidTaskId(itemId)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  const body = await request.json();
  if (typeof body.completed === 'boolean') {
    await checkSubtask(id, itemId, body.completed);
  }
  if (typeof body.title === 'string' && body.title.trim()) {
    await editSubtask(id, itemId, body.title.trim());
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  if (!isValidTaskId(id) || !isValidTaskId(itemId)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  await deleteSubtask(id, itemId);
  return NextResponse.json({ ok: true });
}
