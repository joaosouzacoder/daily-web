import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { isAgendaRange } from '@/lib/agendaWindow';
import { parseLayout } from '@/lib/dashboardLayout';
import { setAgendaDays, setDashboardLayout, resetDashboardLayout } from '@/lib/preferences';
import { dropCache, patchCachedState, refreshAll } from '@/lib/refresher';

/**
 * Preferências de visualização do usuário logado.
 *
 * O período da agenda muda o que o servidor busca, então responde com o
 * estado refeito. O layout não busca nada — só reposiciona o que já está na
 * tela — e por isso corrige o cache em vez de disparar uma volta às
 * integrações a cada painel arrastado.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const userId = auth.value.id;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'corpo inválido' }, { status: 400 });
  }

  if ('layout' in body) {
    if (body.layout === null) {
      resetDashboardLayout(userId);
    } else if (Array.isArray(body.layout)) {
      // parseLayout prende o que vier fora dos limites: um w de 999 ou um id
      // desconhecido não pode virar estado gravado.
      setDashboardLayout(userId, parseLayout(body.layout));
    } else {
      return NextResponse.json({ error: 'layout inválido' }, { status: 400 });
    }

    const { dashboardLayout } = await import('@/lib/preferences');
    const layout = dashboardLayout(userId);
    patchCachedState(userId, (state) => ({ ...state, layout }));
    return NextResponse.json({ layout });
  }

  if ('agendaDays' in body) {
    if (!isAgendaRange(body.agendaDays)) {
      return NextResponse.json({ error: 'período inválido' }, { status: 400 });
    }
    setAgendaDays(userId, body.agendaDays);
    dropCache(userId);
    return NextResponse.json(await refreshAll(userId));
  }

  return NextResponse.json({ error: 'nenhuma preferência informada' }, { status: 400 });
}
