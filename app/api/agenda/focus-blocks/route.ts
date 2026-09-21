import { NextRequest, NextResponse } from 'next/server';
import { requireConnection, upstreamError } from '@/lib/api/context';
import { canWriteEvents } from '@/lib/integrations/agenda';
import { createFocusBlock } from '@/lib/integrations/google/calendar';
import { patchCachedState } from '@/lib/refresher';
import type { AgendaItem } from '@/lib/types';

const KINDS = new Set(['task', 'jira', 'pull']);
const DURATIONS = new Set([25, 50, 90, 120]);

interface FocusBlockBody {
  connectionId?: unknown;
  item?: unknown;
  start?: unknown;
  minutes?: unknown;
}

function invalid(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}

function sortedInsert(items: AgendaItem[], item: AgendaItem): AgendaItem[] {
  return [...items, item].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: FocusBlockBody;
  try {
    body = (await request.json()) as FocusBlockBody;
  } catch {
    return invalid('pedido inválido');
  }

  if (!body || typeof body !== 'object') return invalid('pedido inválido');
  const guarded = await requireConnection('agenda', body.connectionId);
  if (!guarded.ok) return guarded.response;
  const { user, connection } = guarded.value;

  if (!canWriteEvents(connection)) {
    return NextResponse.json(
      { error: 'reconecte o Google para criar blocos de foco', reconnect: true },
      { status: 409 },
    );
  }

  if (!body.item || typeof body.item !== 'object') return invalid('item inválido');
  const source = body.item as Record<string, unknown>;
  if (typeof source.kind !== 'string' || !KINDS.has(source.kind)) {
    return invalid('tipo de item inválido');
  }
  if (typeof source.title !== 'string') return invalid('título inválido');
  const title = source.title.trim();
  if (title.length === 0 || title.length > 200) return invalid('título inválido');
  if (typeof source.ref !== 'string' || source.ref.trim().length > 64) {
    return invalid('referência inválida');
  }
  const ref = source.ref.trim();

  let url: string | undefined;
  if (source.url !== undefined) {
    if (typeof source.url !== 'string') return invalid('URL inválida');
    try {
      const parsed = new URL(source.url);
      if (parsed.protocol !== 'https:') return invalid('URL inválida');
      url = parsed.toString();
    } catch {
      return invalid('URL inválida');
    }
  }

  if (typeof body.start !== 'string') return invalid('início inválido');
  const start = new Date(body.start);
  const now = Date.now();
  if (
    Number.isNaN(start.getTime()) ||
    start.getTime() < now - 5 * 60_000 ||
    start.getTime() > now + 60 * 24 * 60 * 60_000
  ) return invalid('início inválido');
  if (typeof body.minutes !== 'number' || !DURATIONS.has(body.minutes)) {
    return invalid('duração inválida');
  }

  const summary = source.kind === 'task' ? `🔒 ${title}` : `🔒 ${ref} — ${title}`;
  const description = `Bloco de foco criado pelo daily-web.${url ? `\n${url}` : ''}`;
  const end = new Date(start.getTime() + body.minutes * 60_000);

  try {
    const item = await createFocusBlock(connection, { title: summary, description, start, end });
    patchCachedState(user.id, (state) => ({
      ...state,
      agenda: {
        ...state.agenda,
        data: state.agenda.data ? sortedInsert(state.agenda.data, item) : state.agenda.data,
      },
    }));
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return upstreamError(error);
  }
}
