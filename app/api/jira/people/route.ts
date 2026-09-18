import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { isJiraAccountId, jiraFollowedPeople, setJiraFollowedPeople, MAX_JIRA_PEOPLE } from '@/lib/preferences';
import { jiraConnectionOf } from '@/lib/jiraPeople';
import { fetchPerson } from '@/lib/integrations/jiraApi';
import { patchCachedState } from '@/lib/refresher';

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const accountId = body?.accountId;
  if (!isJiraAccountId(accountId)) {
    return NextResponse.json({ error: 'conta do Jira inválida' }, { status: 400 });
  }

  const conn = jiraConnectionOf(auth.value.id);
  if (!conn) {
    return NextResponse.json({ error: 'Jira não conectado' }, { status: 400 });
  }

  const atuais = jiraFollowedPeople(auth.value.id);
  if (atuais.some((p) => p.accountId === accountId)) {
    return NextResponse.json({ people: atuais });
  }

  if (atuais.length >= MAX_JIRA_PEOPLE) {
    return NextResponse.json({ error: `limite de ${MAX_JIRA_PEOPLE} pessoas acompanhadas` }, { status: 400 });
  }

  try {
    const person = await fetchPerson(conn, accountId);
    if (!person) {
      return NextResponse.json({ error: 'pessoa não encontrada no Jira' }, { status: 404 });
    }

    const atualizados = [...atuais, person];
    setJiraFollowedPeople(auth.value.id, atualizados);
    patchCachedState(auth.value.id, (s) => ({ ...s, jiraFollowedPeople: atualizados }));
    return NextResponse.json({ people: atualizados });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const accountId = body?.accountId;
  if (!isJiraAccountId(accountId)) {
    return NextResponse.json({ error: 'conta do Jira inválida' }, { status: 400 });
  }

  const atuais = jiraFollowedPeople(auth.value.id);
  const restantes = atuais.filter((p) => p.accountId !== accountId);
  setJiraFollowedPeople(auth.value.id, restantes);
  patchCachedState(auth.value.id, (s) => ({ ...s, jiraFollowedPeople: restantes }));
  return NextResponse.json({ people: restantes });
}
