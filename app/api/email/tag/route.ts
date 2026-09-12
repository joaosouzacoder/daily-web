import { NextRequest, NextResponse } from 'next/server';
import { isValidEmailId, isValidFolder } from '@/lib/api/validation';
import { requireConnection, upstreamError } from '@/lib/api/context';
import { recordPendingAction } from '@/lib/email/pendingActions';
import { replayPendingActions } from '@/lib/email/replay';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!isValidEmailId(body?.id) || !isValidFolder(body?.tag)) {
    return NextResponse.json({ error: 'id ou etiqueta inválidos' }, { status: 400 });
  }

  const guard = await requireConnection('email', body?.account);
  if (!guard.ok) return guard.response;

  try {
    recordPendingAction({
      userId: guard.value.user.id,
      account: guard.value.connection.id,
      uid: body.id,
      kind: 'move',
      payload: body.tag,
    });
    await replayPendingActions(guard.value.user.id, [guard.value.connection]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return upstreamError(err);
  }
}
