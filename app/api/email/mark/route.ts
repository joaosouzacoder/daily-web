import { NextRequest, NextResponse } from 'next/server';
import { setSeen } from '@/lib/integrations/imap';
import { isValidEmailId } from '@/lib/api/validation';
import { requireConnection, upstreamError } from '@/lib/api/context';
import { patchCachedState } from '@/lib/refresher';
import { markEmailsSeen } from '@/lib/statePatches';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!isValidEmailId(body?.id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const guard = await requireConnection('email', body?.account);
  if (!guard.ok) return guard.response;

  try {
    const seen = Boolean(body.seen);
    await setSeen(guard.value.connection, [body.id], seen);
    // Sem corrigir o cache, o painel recarrega e volta a mostrar o e-mail
    // como não lido até o próximo ciclo do refresher.
    patchCachedState(guard.value.user.id, (state) =>
      markEmailsSeen(state, [{ account: body.account, id: body.id }], seen),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return upstreamError(err);
  }
}
