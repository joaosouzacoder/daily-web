import { NextRequest, NextResponse } from 'next/server';
import { requireConnection, upstreamError } from '@/lib/api/context';
import { getMailboxes, isKnownMailbox } from '@/lib/email/mailboxes';
import { listPendingActions } from '@/lib/email/pendingActions';
import { syncFolder } from '@/lib/email/sync';
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

    // Por diferença: o que chegou desde a última leitura desta pasta, mais a
    // reconferência da janela recente. A pasta inteira não é relida — e uma
    // reindexação do servidor invalida ali as ações que dependiam dos uids.
    const page = await syncFolder(user.id, connection, folder, limitFrom(params.get('limit')));

    return NextResponse.json({
      messages: reconcileEnvelopes(page.envelopes, listPendingActions(user.id)),
      uidvalidity: page.uidvalidity,
      reindexed: page.reindexed,
    });
  } catch (err) {
    return upstreamError(err);
  }
}
