import { NextResponse } from 'next/server';
import { addTask, editTask } from '@/lib/cli/mstodo';
import { parseDueInput } from '@/lib/dateParsing';
import { isValidTaskPriority, isValidRecur, isSafePositionalValue } from '@/lib/api/validation';

export async function POST(request: Request) {
  const body = await request.json();
  const title: string = body.title ?? '';
  if (!title.trim()) {
    return NextResponse.json({ error: 'título obrigatório' }, { status: 400 });
  }
  if (!isSafePositionalValue(title.trim())) {
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

  const id = await addTask(title.trim());

  if (due !== undefined || body.priority !== undefined || body.recur !== undefined) {
    await editTask(id, { due, time, priority: body.priority, recur: body.recur });
  }
  return NextResponse.json({ id });
}
