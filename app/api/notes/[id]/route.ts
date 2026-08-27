import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { deleteNote, NoteLimitError, updateNote } from '@/lib/notes';

async function aplicar(request: NextRequest, id: string) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const title = body?.title;
  const text = body?.body;

  if (title !== undefined && typeof title !== 'string') {
    return NextResponse.json({ error: 'título precisa ser texto' }, { status: 400 });
  }
  if (text !== undefined && typeof text !== 'string') {
    return NextResponse.json({ error: 'nota precisa ser texto' }, { status: 400 });
  }
  if (title === undefined && text === undefined) {
    return NextResponse.json({ error: 'nada para alterar' }, { status: 400 });
  }

  try {
    // A nota é buscada pelo dono da sessão, então um id de outra pessoa não
    // encontra linha nenhuma e volta 404 — nunca o conteúdo dela.
    const note = updateNote(auth.value.id, id, { title, body: text });
    if (!note) return NextResponse.json({ error: 'nota não encontrada' }, { status: 404 });
    return NextResponse.json({ note });
  } catch (err) {
    if (err instanceof NoteLimitError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return aplicar(request, id);
}

/**
 * A mesma gravação, por POST. Existe porque `navigator.sendBeacon` — o único
 * envio que sobrevive ao fechamento da aba, e que salva o que foi digitado
 * nos últimos instantes — só sabe fazer POST.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return aplicar(request, id);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!deleteNote(auth.value.id, id)) {
    return NextResponse.json({ error: 'nota não encontrada' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
