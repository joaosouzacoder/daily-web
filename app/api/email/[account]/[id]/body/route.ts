import { NextResponse } from 'next/server';
import { fetchBody } from '@/lib/cli/himalaya';
import { isValidAccount, isValidEmailId } from '@/lib/api/validation';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ account: string; id: string }> },
) {
  const { account, id } = await params;
  if (!isValidAccount(account) || !isValidEmailId(id)) {
    return NextResponse.json({ error: 'conta ou id inválido' }, { status: 400 });
  }
  try {
    const text = await fetchBody(account, id);
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
