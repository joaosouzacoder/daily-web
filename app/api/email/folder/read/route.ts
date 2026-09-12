import { NextRequest, NextResponse } from 'next/server';
import { requireConnection, upstreamError } from '@/lib/api/context';
import { isKnownMailbox, getMailboxUidValidity } from '@/lib/email/mailboxes';
import { recordPendingAction } from '@/lib/email/pendingActions';
import { replayPendingActions } from '@/lib/email/replay';

/**
 * Marca a pasta inteira como lida — inclusive o que é velho demais para ter
 * sido sincronizado, que é o que quem pede isso espera.
 *
 * É uma intenção só, gravada antes de a escrita sair daqui, e vale para a
 * pasta: não vira uma linha por mensagem nem uma conexão por lote.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const guard = await requireConnection('email', body?.account);
  if (!guard.ok) return guard.response;
  const { user, connection } = guard.value;

  const folder: unknown = body?.folder;
  // A pasta vem da tela, que é entrada não confiável: só um caminho que o
  // servidor declarou para esta conta é aceito.
  if (typeof folder !== 'string' || !isKnownMailbox(user.id, connection.id, folder)) {
    return NextResponse.json({ error: 'pasta não encontrada' }, { status: 404 });
  }

  try {
    recordPendingAction({
      userId: user.id,
      account: connection.id,
      // A ação é da pasta, não de uma mensagem.
      uid: '',
      kind: 'read_folder',
      mailbox: folder,
      uidvalidity: getMailboxUidValidity(user.id, connection.id, folder),
    });
    await replayPendingActions(user.id, [connection]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return upstreamError(err);
  }
}
