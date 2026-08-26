import { NextResponse } from 'next/server';
import { editTask, completeTask, reopenTask, deleteTask } from '@/lib/cli/mstodo';
import { parseDueInput } from '@/lib/dateParsing';
import { isValidTaskId, isValidTaskPriority, isValidRecur, isSafePositionalValue } from '@/lib/api/validation';
import { getCurrentUser } from '@/lib/auth/currentUser';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidTaskId(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  const body = await request.json();

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    if (body.completed === true) {
      await completeTask(user.id, id);
      return NextResponse.json({ ok: true });
    }
    if (body.completed === false) {
      await reopenTask(user.id, id);
      return NextResponse.json({ ok: true });
    }

    if (body.title !== undefined && !isSafePositionalValue(body.title)) {
      return NextResponse.json({ error: 'título inválido' }, { status: 400 });
    }
    if (body.priority !== undefined && !isValidTaskPriority(body.priority)) {
      return NextResponse.json({ error: 'prioridade inválida' }, { status: 400 });
    }
    if (body.recur !== undefined && !isValidRecur(body.recur)) {
      return NextResponse.json({ error: 'recorrência inválida' }, { status: 400 });
    }

    let due: string | undefined;
    let time: string | undefined;
    if (typeof body.due === 'string') {
      try {
        const parsed = parseDueInput(body.due);
        due = parsed.due;
        time = parsed.time;
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
      }
    }

    await editTask(user.id, id, { title: body.title, due, time, recur: body.recur, priority: body.priority });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidTaskId(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    await deleteTask(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
