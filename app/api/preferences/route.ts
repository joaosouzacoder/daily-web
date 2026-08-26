import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { isAgendaRange } from '@/lib/agendaWindow';
import { setAgendaDays } from '@/lib/preferences';
import { dropCache, refreshAll } from '@/lib/refresher';

/** Preferências de visualização do usuário logado. Responde já com o estado
 *  novo: mudar a janela da agenda muda o que o servidor busca, então devolver
 *  o painel pronto evita uma segunda ida ao servidor. */
export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const days = body?.agendaDays;
  if (!isAgendaRange(days)) {
    return NextResponse.json({ error: 'período inválido' }, { status: 400 });
  }

  setAgendaDays(auth.value.id, days);
  dropCache(auth.value.id);
  return NextResponse.json(await refreshAll(auth.value.id));
}
