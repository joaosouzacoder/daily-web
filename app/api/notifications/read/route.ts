import { NextResponse } from 'next/server';
import { markManyRead, parseNotificationId } from '@/lib/notifications';
import { requireUser } from '@/lib/api/context';
import { patchCachedState } from '@/lib/refresher';
import { markNotificationsRead } from '@/lib/statePatches';

/** Teto de segurança. O sino traz no máximo 20 avisos por fonte, e são três
 *  fontes: um corpo maior do que isto não vem da tela. */
const MAX_IDS = 200;

/** Aceita `id` (um aviso) ou `ids` (o sino inteiro). Os dois casos fazem a
 *  mesma coisa, então dividir em duas rotas só duplicaria a validação. */
function readIds(body: unknown): string[] | null {
  const corpo = body as { id?: unknown; ids?: unknown } | null;
  if (Array.isArray(corpo?.ids)) {
    if (corpo.ids.length > MAX_IDS) return null;
    return corpo.ids.every((id) => typeof id === 'string') ? (corpo.ids as string[]) : null;
  }
  if (typeof corpo?.id === 'string') return [corpo.id];
  return null;
}

// O id vai no corpo, não no caminho: ele carrega o id externo da origem, que
// é texto livre — o de um pull request tem '/' e '#', o de um e-mail é um
// Message-Id. No caminho, o '#' truncava a URL antes mesmo de sair do
// navegador e a requisição chegava sem o '/read'.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const ids = readIds(body);
  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: 'notificação inválida' }, { status: 400 });
  }

  const avisos = ids.map((id) => ({ id, parsed: parseNotificationId(id) }));
  // Um id irreconhecível reprova o lote inteiro. Gravar parte dele deixaria a
  // tela dizendo "tudo lido" com avisos que voltam no ciclo seguinte.
  if (avisos.some((aviso) => aviso.parsed === null)) {
    return NextResponse.json({ error: 'notificação inválida' }, { status: 400 });
  }

  try {
    const marked = markManyRead(
      auth.value.id,
      avisos.map((aviso) => aviso.parsed!),
    );
    // O badge lê do estado em cache. Sem esta correção ele só baixaria no
    // próximo ciclo do refresher — que busca menções no Jira e leva minutos.
    patchCachedState(auth.value.id, (state) => markNotificationsRead(state, ids));
    return NextResponse.json({ ok: true, marked });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
