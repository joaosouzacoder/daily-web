import { NextRequest, NextResponse } from 'next/server';
import { sendReply } from '@/lib/integrations/imap';
import { isValidEmailId } from '@/lib/api/validation';
import { requireConnection, upstreamError } from '@/lib/api/context';

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  if (!isValidEmailId(payload?.id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  if (typeof payload.body !== 'string' || payload.body.trim().length === 0) {
    return NextResponse.json({ error: 'resposta vazia' }, { status: 400 });
  }

  const guard = await requireConnection('email', payload?.account);
  if (!guard.ok) return guard.response;

  try {
    await sendReply(guard.value.connection, payload.id, payload.body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return upstreamError(err);
  }
}
