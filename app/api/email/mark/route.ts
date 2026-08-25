import { NextResponse } from 'next/server';
import { setSeen } from '@/lib/cli/himalaya';
import type { Account } from '@/lib/types';

export async function POST(request: Request) {
  const body = await request.json();
  await setSeen(body.account as Account, body.id as string, body.seen as boolean);
  return NextResponse.json({ ok: true });
}
