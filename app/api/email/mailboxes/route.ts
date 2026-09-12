import { NextRequest, NextResponse } from 'next/server';
import { requireConnection, upstreamError } from '@/lib/api/context';
import { getStoredMailboxes, storedSyncedAt, syncMailboxes } from '@/lib/email/mailboxes';

/**
 * A árvore de pastas da conta.
 *
 * Por padrão responde do banco, sem tocar no servidor: o painel precisa abrir
 * na hora, com o que já se sabe. `sync=1` é a leitura de verdade, que o painel
 * dispara em segundo plano depois de já ter desenhado o que tinha.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const guard = await requireConnection('email', params.get('account'));
  if (!guard.ok) return guard.response;
  const { user, connection } = guard.value;

  if (params.get('sync') !== '1') {
    return NextResponse.json({
      mailboxes: getStoredMailboxes(user.id, connection.id),
      syncedAt: storedSyncedAt(user.id, connection.id),
      cached: true,
    });
  }

  try {
    const { mailboxes, added, removed } = await syncMailboxes(user.id, connection);
    return NextResponse.json({
      mailboxes,
      syncedAt: storedSyncedAt(user.id, connection.id),
      cached: false,
      added,
      removed,
    });
  } catch (err) {
    return upstreamError(err);
  }
}
