import { NextRequest, NextResponse } from 'next/server';
import { applyTag } from '@/lib/cli/himalaya';
import { isValidAccount, isValidEmailId, isValidFolder } from '@/lib/api/validation';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!isValidAccount(body?.account) || !isValidEmailId(body?.id) || !isValidFolder(body?.tag)) {
    return NextResponse.json({ error: 'conta, id ou etiqueta inválidos' }, { status: 400 });
  }
  try {
    await applyTag(body.account, body.id, body.tag);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
