import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { isJiraKey, jiraWatchedKeys, setJiraWatchedKeys } from '@/lib/preferences';
import { dropCache, refreshAll } from '@/lib/refresher';

/** Acrescenta uma issue à lista de acompanhamento. */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (!isJiraKey(body?.key)) {
    return NextResponse.json(
      { error: 'chave inválida — use o formato ABC-123' },
      { status: 400 },
    );
  }

  const atuais = jiraWatchedKeys(auth.value.id);
  setJiraWatchedKeys(auth.value.id, [...atuais, body.key]);
  // Acompanhar uma issue nova exige buscá-la: o estado em cache não a tem.
  dropCache(auth.value.id);
  return NextResponse.json(await refreshAll(auth.value.id));
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (!isJiraKey(body?.key)) {
    return NextResponse.json({ error: 'chave inválida' }, { status: 400 });
  }

  const alvo = String(body.key).toUpperCase();
  const restantes = jiraWatchedKeys(auth.value.id).filter((k) => k !== alvo);
  setJiraWatchedKeys(auth.value.id, restantes);
  dropCache(auth.value.id);
  return NextResponse.json(await refreshAll(auth.value.id));
}
