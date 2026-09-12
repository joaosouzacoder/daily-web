import { NextRequest, NextResponse } from 'next/server';
import { isValidEmailId, isValidFolder } from '@/lib/api/validation';
import { requireConnection, upstreamError } from '@/lib/api/context';
import { recordPendingAction } from '@/lib/email/pendingActions';
import { replayPendingActions } from '@/lib/email/replay';

import { INBOX_PATH } from '@/lib/email/pendingActions';
import { isKnownMailbox, getMailboxUidValidity } from '@/lib/email/mailboxes';

/** A pasta vem da tela e é entrada não confiável: ou é a entrada, ou é um
 *  caminho que o servidor já declarou para esta conta. */
function mailboxFrom(userId: string, account: string, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === INBOX_PATH) return INBOX_PATH;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return isKnownMailbox(userId, account, raw) ? raw : null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!isValidEmailId(body?.id) || !isValidFolder(body?.tag)) {
    return NextResponse.json({ error: 'id ou etiqueta inválidos' }, { status: 400 });
  }

  const guard = await requireConnection('email', body?.account);
  if (!guard.ok) return guard.response;

  try {
    const mailbox = mailboxFrom(guard.value.user.id, guard.value.connection.id, body?.folder);
    if (mailbox === null) {
      return NextResponse.json({ error: 'pasta não encontrada' }, { status: 404 });
    }

    recordPendingAction({
      userId: guard.value.user.id,
      account: guard.value.connection.id,
      uid: body.id,
      // Etiquetar é copiar para a pasta: a mensagem fica onde está.
      kind: 'tag',
      payload: body.tag,
      mailbox,
      // O uid só vale enquanto a numeração da pasta não é reiniciada.
      uidvalidity: getMailboxUidValidity(guard.value.user.id, guard.value.connection.id, mailbox),
    });
    await replayPendingActions(guard.value.user.id, [guard.value.connection]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return upstreamError(err);
  }
}
