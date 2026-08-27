import { NextRequest, NextResponse } from 'next/server';
import { applyTag } from '@/lib/integrations/imap';
import { isValidEmailId, isValidFolder } from '@/lib/api/validation';
import { requireConnection, upstreamError } from '@/lib/api/context';
import { patchCachedState } from '@/lib/refresher';
import { markEmailsSeen } from '@/lib/statePatches';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!isValidEmailId(body?.id) || !isValidFolder(body?.tag)) {
    return NextResponse.json({ error: 'id ou etiqueta inválidos' }, { status: 400 });
  }

  const guard = await requireConnection('email', body?.account);
  if (!guard.ok) return guard.response;

  try {
    await applyTag(guard.value.connection, [body.id], body.tag);
    // Etiquetar é uma cópia: a mensagem continua na caixa, então nada sai da
    // lista. Só o "lido" muda, porque o servidor marca ao copiar.
    patchCachedState(guard.value.user.id, (state) =>
      markEmailsSeen(state, [{ account: body.account, id: body.id }], true),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return upstreamError(err);
  }
}
