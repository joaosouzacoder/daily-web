import { NextResponse } from 'next/server';
import { gmailUrl } from '@/lib/cli/himalaya';
import type { Account } from '@/lib/types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ account: string; id: string }> },
) {
  const { account, id } = await params;
  const url = await gmailUrl(account as Account, id);
  return NextResponse.json({ url });
}
