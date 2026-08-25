import { NextRequest, NextResponse } from 'next/server';
import { sendReply } from '@/lib/cli/himalaya';
import { isValidAccount, isValidEmailId } from '@/lib/api/validation';

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  if (!isValidAccount(payload?.account) || !isValidEmailId(payload?.id)) {
    return NextResponse.json({ error: 'conta ou id inválido' }, { status: 400 });
  }
  if (typeof payload.body !== 'string' || payload.body.trim().length === 0) {
    return NextResponse.json({ error: 'resposta vazia' }, { status: 400 });
  }

  try {
    await sendReply(payload.account, payload.id, payload.body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
