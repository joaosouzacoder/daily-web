import { NextRequest, NextResponse } from 'next/server';
import { isValidEmailId } from '@/lib/api/validation';
import { requireConnection, upstreamError } from '@/lib/api/context';
import { recordPendingAction } from '@/lib/email/pendingActions';
import { replayPendingActions } from '@/lib/email/replay';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!isValidEmailId(body?.id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const guard = await requireConnection('email', body?.account);
  if (!guard.ok) return guard.response;

  try {
    const seen = Boolean(body.seen);
    // A intenção é gravada antes de a escrita sair daqui: se ela falhar, o
    // retrato seguinte do servidor não pode desfazer o que o usuário pediu.
    recordPendingAction({
      userId: guard.value.user.id,
      account: guard.value.connection.id,
      uid: body.id,
      kind: seen ? 'seen' : 'unseen',
    });
    await replayPendingActions(guard.value.user.id, [guard.value.connection]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return upstreamError(err);
  }
}
