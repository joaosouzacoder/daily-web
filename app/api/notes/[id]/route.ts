import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { deleteNote, moveNote, NoteLimitError, updateNote } from '@/lib/notes';
import { scheduleNotesSync } from '@/lib/notesSync';

async function aplicar(request: NextRequest, id: string) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const title = body?.title;
  const text = body?.body;
  // Mover é distinto de não mexer na pasta: `folderId: null` tira a nota da
  // pasta, e a chave ausente deixa onde está.
  const moving = body !== null && typeof body === 'object' && 'folderId' in body;
  const folderId = moving ? (body.folderId ?? null) : undefined;

  if (title !== undefined && typeof title !== 'string') {
    return NextResponse.json({ error: 'título precisa ser texto' }, { status: 400 });
  }
  if (text !== undefined && typeof text !== 'string') {
    return NextResponse.json({ error: 'nota precisa ser texto' }, { status: 400 });
  }
  if (folderId !== undefined && folderId !== null && typeof folderId !== 'string') {
    return NextResponse.json({ error: 'pasta precisa ser texto' }, { status: 400 });
  }
  if (title === undefined && text === undefined && folderId === undefined) {
    return NextResponse.json({ error: 'nada para alterar' }, { status: 400 });
  }

  try {
    // A nota é buscada pelo dono da sessão, então um id de outra pessoa não
    // encontra linha nenhuma e volta 404 — nunca o conteúdo dela.
    let note =
      title === undefined && text === undefined
        ? null
        : updateNote(auth.value.id, id, { title, body: text });
    if (folderId !== undefined) note = moveNote(auth.value.id, id, folderId);
    if (!note) return NextResponse.json({ error: 'nota não encontrada' }, { status: 404 });
    scheduleNotesSync(auth.value.id);
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
  scheduleNotesSync(auth.value.id);
  return NextResponse.json({ ok: true });
}
