import { NextRequest, NextResponse } from 'next/server';
import { requireConnection, upstreamError } from '@/lib/api/context';
import { listCalendars, selectedCalendars } from '@/lib/integrations/google/calendar';
import { moduleStates, saveConnection } from '@/lib/vault/connections';
import { dropCache } from '@/lib/refresher';

/** Quais agendas a conta tem, e quais estão marcadas. */
export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  const guard = await requireConnection('agenda', id);
  if (!guard.ok) return guard.response;

  try {
    return NextResponse.json({
      calendars: await listCalendars(guard.value.connection),
      selected: selectedCalendars(guard.value.connection),
    });
  } catch (err) {
    return upstreamError(err);
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const guard = await requireConnection('agenda', body?.id);
  if (!guard.ok) return guard.response;

  const ids: unknown = body?.calendarIds;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'calendarIds precisa ser uma lista' }, { status: 400 });
  }

  const { user, connection } = guard.value;
  saveConnection(
    user.id,
    'agenda',
    connection.label,
    { ...connection.values, calendarIds: (ids as string[]).join(',') },
    connection.id,
  );
  dropCache(user.id);
  return NextResponse.json({ modules: moduleStates(user.id) });
}
