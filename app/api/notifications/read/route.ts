import { NextResponse } from 'next/server';
import { markRead, parseNotificationId } from '@/lib/notifications';
import { requireUser } from '@/lib/api/context';
import { patchCachedState } from '@/lib/refresher';
import { markNotificationRead } from '@/lib/statePatches';

// O id vai no corpo, não no caminho: ele carrega o id externo da origem, que
// é texto livre — o de um pull request tem '/' e '#', o de um e-mail é um
// Message-Id. No caminho, o '#' truncava a URL antes mesmo de sair do
// navegador e a requisição chegava sem o '/read'.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== 'string') {
    return NextResponse.json({ error: 'notificação inválida' }, { status: 400 });
  }

  const parsed = parseNotificationId(id);
  if (!parsed) return NextResponse.json({ error: 'notificação inválida' }, { status: 400 });

  try {
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
