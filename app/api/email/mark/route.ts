import { NextResponse } from 'next/server';
import { setSeen } from '@/lib/cli/himalaya';
import { isValidAccount, isValidEmailId } from '@/lib/api/validation';

export async function POST(request: Request) {
  const body = await request.json();
  if (!isValidAccount(body.account) || !isValidEmailId(body.id)) {
    return NextResponse.json({ error: 'conta ou id inválido' }, { status: 400 });
  }
  await setSeen(body.account, body.id, body.seen as boolean);
  return NextResponse.json({ ok: true });
}
