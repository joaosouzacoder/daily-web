import { NextRequest, NextResponse } from 'next/server';
import { requireConnection, upstreamError } from '@/lib/api/context';
import { isValidEmailId } from '@/lib/api/validation';
import { addTask } from '@/lib/tasks';
import { refreshTasks } from '@/lib/refresher';
import { getMailboxUidValidity, isKnownMailbox } from '@/lib/email/mailboxes';
import { getStoredMessage } from '@/lib/email/messages';
import { INBOX_PATH } from '@/lib/email/pendingActions';
import { recentCreation, rememberCreation, taskTitleFrom } from '@/lib/email/fromEmail';

/**
 * Uma tarefa a partir de um e-mail: o assunto e quem escreveu, nada do corpo.
 *
 * O assunto e o remetente saem do que já foi sincronizado, e não do que a tela
 * mandou: o conteúdo da tarefa não pode vir de um campo que o cliente escolhe.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!isValidEmailId(body?.id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const guard = await requireConnection('email', body?.account);
  if (!guard.ok) return guard.response;
  const { user, connection } = guard.value;

  const folder = typeof body?.folder === 'string' && body.folder ? body.folder : INBOX_PATH;
  if (folder !== INBOX_PATH && !isKnownMailbox(user.id, connection.id, folder)) {
    return NextResponse.json({ error: 'pasta não encontrada' }, { status: 404 });
  }

  const origem = {
    userId: user.id,
    account: connection.id,
    folder,
    uid: String(body.id),
    kind: 'task' as const,
  };
  const jaCriada = recentCreation(origem);
  if (jaCriada) return NextResponse.json({ taskId: jaCriada, repeated: true });

  const uidvalidity = getMailboxUidValidity(user.id, connection.id, folder);
  const guardada = getStoredMessage(user.id, connection.id, folder, uidvalidity, String(body.id));
  if (!guardada) {
    return NextResponse.json({ error: 'mensagem não encontrada' }, { status: 404 });
  }

  try {
    const id = await addTask(user.id, taskTitleFrom(guardada.subject, guardada.from));
    rememberCreation(origem, id);
    await refreshTasks(user.id);
    return NextResponse.json({ taskId: id });
  } catch (err) {
    return upstreamError(err);
  }
}
