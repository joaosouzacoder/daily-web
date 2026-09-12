import { NextRequest, NextResponse } from 'next/server';
import { requireConnection, upstreamError } from '@/lib/api/context';
import { isValidEmailId } from '@/lib/api/validation';
import { createNote, updateNote, NoteLimitError } from '@/lib/notes';
import { FolderMoveError } from '@/lib/noteFolders';
import { scheduleNotesSync } from '@/lib/notesSync';
import { fetchBodyParts } from '@/lib/integrations/imap';
import { getCachedBody } from '@/lib/emailCache';
import { getMailboxUidValidity, isKnownMailbox } from '@/lib/email/mailboxes';
import { getStoredMessage } from '@/lib/email/messages';
import { INBOX_PATH } from '@/lib/email/pendingActions';
import { htmlToMarkdown } from '@/lib/parsers/htmlToMarkdown';
import { recentCreation, rememberCreation, subjectTitle } from '@/lib/email/fromEmail';

/**
 * Uma nota a partir de um e-mail: o assunto vira título e o corpo vira o texto
 * dela, em Markdown.
 *
 * O corpo é buscado no servidor para a conversão receber o HTML — o que está
 * em cache já foi achatado para leitura na tela, e dele os links não voltam.
 * Se a busca falhar, o cache serve: uma nota com o texto é melhor do que
 * nenhuma nota.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!isValidEmailId(body?.id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const guard = await requireConnection('email', body?.account);
  if (!guard.ok) return guard.response;
  const { user, connection } = guard.value;

  const folder =
    typeof body?.folder === 'string' && body.folder ? body.folder : INBOX_PATH;
  if (folder !== INBOX_PATH && !isKnownMailbox(user.id, connection.id, folder)) {
    return NextResponse.json({ error: 'pasta não encontrada' }, { status: 404 });
  }

  const folderId = typeof body?.folderId === 'string' && body.folderId ? body.folderId : null;
  const origem = {
    userId: user.id,
    account: connection.id,
    folder,
    uid: String(body.id),
    kind: 'note' as const,
  };

  // Um clique repetido devolve a nota da primeira vez em vez de criar outra.
  const jaCriada = recentCreation(origem);
  if (jaCriada) return NextResponse.json({ noteId: jaCriada, repeated: true });

  const uidvalidity = getMailboxUidValidity(user.id, connection.id, folder);
  const guardada = getStoredMessage(user.id, connection.id, folder, uidvalidity, String(body.id));
  const assunto = guardada?.subject ?? '';

  try {
    let markdown = '';
    try {
      const partes = await fetchBodyParts(connection, String(body.id), folder);
      markdown = partes.html
        ? htmlToMarkdown(partes.html)
        : partes.text.trim();
    } catch {
      // A caixa não respondeu: o que está em cache é texto já legível, e vale
      // mais do que desistir da nota.
      markdown = getCachedBody(user.id, connection.id, String(body.id), 'inbox') ?? '';
    }

    const note = createNote(user.id, subjectTitle(assunto), folderId);
    const comCorpo = updateNote(user.id, note.id, { body: markdown });
    rememberCreation(origem, note.id);
    scheduleNotesSync(user.id);

    return NextResponse.json({ noteId: note.id, note: comCorpo ?? note });
  } catch (err) {
    if (err instanceof NoteLimitError || err instanceof FolderMoveError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return upstreamError(err);
  }
}
