import { NextRequest, NextResponse } from 'next/server';
import { setSeen } from '@/lib/integrations/imap';
import { isValidEmailId } from '@/lib/api/validation';
import { requireConnection, upstreamError } from '@/lib/api/context';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!isValidEmailId(body?.id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const guard = await requireConnection('email', body?.account);
  if (!guard.ok) return guard.response;

  try {
    await setSeen(guard.value.connection, body.id, Boolean(body.seen));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return upstreamError(err);
  }
}
