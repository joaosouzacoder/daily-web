import { NextResponse } from 'next/server';
import { editSubtask, checkSubtask, deleteSubtask } from '@/lib/cli/mstodo';
import { isValidTaskId, isSafePositionalValue } from '@/lib/api/validation';

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
  try {
    if (typeof body.completed === 'boolean') {
      await checkSubtask(id, itemId, body.completed);
    }
    if (typeof body.title === 'string' && body.title.trim()) {
      await editSubtask(id, itemId, body.title.trim());
    }
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
  try {
    await deleteSubtask(id, itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
