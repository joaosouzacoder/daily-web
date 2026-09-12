import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { deleteFolder, FolderMoveError, moveFolder, renameFolder } from '@/lib/noteFolders';
import { NoteLimitError } from '@/lib/notes';
import { scheduleNotesSync } from '@/lib/notesSync';

/**
 * Renomear e mover. A pasta é buscada pelo dono da sessão, então um id de
 * outra pessoa não encontra nada e volta 404 — nunca o conteúdo dela.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const name = body?.name;
  const moving = body !== null && typeof body === 'object' && 'parentId' in body;
  const parentId = moving ? (body.parentId ?? null) : undefined;

  if (name !== undefined && typeof name !== 'string') {
    return NextResponse.json({ error: 'nome precisa ser texto' }, { status: 400 });
  }
  if (parentId !== undefined && parentId !== null && typeof parentId !== 'string') {
    return NextResponse.json({ error: 'pasta de cima precisa ser texto' }, { status: 400 });
  }
  if (name === undefined && parentId === undefined) {
    return NextResponse.json({ error: 'nada para alterar' }, { status: 400 });
  }

  try {
    let folder = name === undefined ? null : renameFolder(auth.value.id, id, name);
    if (name !== undefined && !folder) {
      return NextResponse.json({ error: 'pasta não encontrada' }, { status: 404 });
    }
    if (parentId !== undefined) folder = moveFolder(auth.value.id, id, parentId);
    scheduleNotesSync(auth.value.id);
    return NextResponse.json({ folder });
  } catch (err) {
    if (err instanceof NoteLimitError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof FolderMoveError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.reason === 'unknown' ? 404 : 400 },
      );
    }
    throw err;
  }
}

/** Apaga a pasta e as subpastas. As notas de dentro vão para "Sem pasta" —
 *  a tela avisa disso antes de chamar. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  if (!deleteFolder(auth.value.id, id)) {
    return NextResponse.json({ error: 'pasta não encontrada' }, { status: 404 });
  }
  scheduleNotesSync(auth.value.id);
  return NextResponse.json({ ok: true });
}
