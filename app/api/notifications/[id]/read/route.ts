import { NextResponse } from 'next/server';
import { markRead, parseNotificationId } from '@/lib/notifications';
import { requireUser } from '@/lib/api/context';
import { patchCachedState } from '@/lib/refresher';
import { markNotificationRead } from '@/lib/statePatches';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    // A fonte vem do próprio id. Fixá-la em 'jira_mention' gravava o aviso de
    // PR e de e-mail na chave errada, e eles voltavam no ciclo seguinte.
    const parsed = parseNotificationId(id);
    if (!parsed) return NextResponse.json({ error: 'notificação inválida' }, { status: 400 });

    markRead(auth.value.id, parsed.source, parsed.externalId);
    // O badge lê do estado em cache. Sem esta correção ele só baixaria no
    // próximo ciclo do refresher — que busca menções no Jira e leva minutos.
    patchCachedState(auth.value.id, (state) => markNotificationRead(state, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
