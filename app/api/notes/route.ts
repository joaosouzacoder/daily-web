import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { createNote, listNotes, NoteLimitError, reorderNotes } from '@/lib/notes';

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ notes: listNotes(auth.value.id) });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title : '';

  try {
    return NextResponse.json({ note: createNote(auth.value.id, title) });
  } catch (err) {
    if (err instanceof NoteLimitError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

/** Reordenar as abas. A lista chega inteira porque a posição é relativa: uma
 *  aba só sabe onde está em relação às outras. */
export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.ids) || body.ids.some((id: unknown) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'ids precisa ser uma lista de textos' }, { status: 400 });
  }

  return NextResponse.json({ notes: reorderNotes(auth.value.id, body.ids as string[]) });
}
