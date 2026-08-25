import { NextResponse } from 'next/server';
import { fetchBody } from '@/lib/cli/himalaya';
import type { Account } from '@/lib/types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ account: string; id: string }> },
) {
  const { account, id } = await params;
  try {
    const text = await fetchBody(account as Account, id);
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
