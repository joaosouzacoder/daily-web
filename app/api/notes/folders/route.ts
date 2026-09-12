import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { createFolder, FolderMoveError, listFolders } from '@/lib/noteFolders';
import { NoteLimitError } from '@/lib/notes';
import { scheduleNotesSync } from '@/lib/notesSync';

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ folders: listFolders(auth.value.id) });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (typeof body?.name !== 'string') {
    return NextResponse.json({ error: 'nome precisa ser texto' }, { status: 400 });
  }
  const parentId = body.parentId ?? null;
  if (parentId !== null && typeof parentId !== 'string') {
    return NextResponse.json({ error: 'pasta de cima precisa ser texto' }, { status: 400 });
  }

  try {
    const folder = createFolder(auth.value.id, body.name, parentId);
    scheduleNotesSync(auth.value.id);
    return NextResponse.json({ folder });
  } catch (err) {
    if (err instanceof NoteLimitError || err instanceof FolderMoveError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
