import { NextResponse } from 'next/server';
import { markRead } from '@/lib/notifications';
import { requireUser } from '@/lib/api/context';
import { patchCachedState } from '@/lib/refresher';
import { markNotificationRead } from '@/lib/statePatches';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    markRead(auth.value.id, 'jira_mention', id);
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
