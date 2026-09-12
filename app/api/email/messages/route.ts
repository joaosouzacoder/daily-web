import { NextRequest, NextResponse } from 'next/server';
import { listFolder } from '@/lib/integrations/imap';
import { requireConnection, upstreamError } from '@/lib/api/context';
import { getMailboxes, isKnownMailbox, setMailboxUidValidity } from '@/lib/email/mailboxes';
import { listPendingActions, invalidateForUidValidity } from '@/lib/email/pendingActions';
import { reconcileEnvelopes } from '@/lib/email/reconcile';

/** Teto por leitura. A caixa inteira não cabe numa resposta nem numa tela. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function limitFrom(raw: string | null): number {
  const valor = Number(raw);
  if (!Number.isFinite(valor) || valor <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(valor), MAX_LIMIT);
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const guard = await requireConnection('email', params.get('account'));
  if (!guard.ok) return guard.response;
  const { user, connection } = guard.value;

  const folder = params.get('folder');
  if (!folder) return NextResponse.json({ error: 'pasta obrigatória' }, { status: 400 });

  try {
    // A pasta vem da tela. Só um caminho que o servidor declarou para esta
    // conta é aceito: assim nada abre uma caixa que ninguém escolheu.
    if (!isKnownMailbox(user.id, connection.id, folder)) {
      await getMailboxes(user.id, connection);
      if (!isKnownMailbox(user.id, connection.id, folder)) {
        return NextResponse.json({ error: 'pasta não encontrada' }, { status: 404 });
      }
    }

    const page = await listFolder(connection, folder, limitFrom(params.get('limit')));

    // Numeração reiniciada pelo servidor: todo uid pedido antes passou a
    // apontar para outra mensagem, e aplicar a ação agora acertaria quem não
    // foi escolhido.
    if (page.uidvalidity) {
      invalidateForUidValidity(user.id, connection.id, folder, page.uidvalidity);
      setMailboxUidValidity(user.id, connection.id, folder, page.uidvalidity);
    }

    return NextResponse.json({
      messages: reconcileEnvelopes(page.envelopes, listPendingActions(user.id)),
      uidvalidity: page.uidvalidity,
      total: page.total,
    });
  } catch (err) {
    return upstreamError(err);
  }
}
