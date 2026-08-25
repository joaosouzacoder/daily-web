import { NextResponse } from 'next/server';
import { listFolders } from '@/lib/cli/himalaya';
import type { Account } from '@/lib/types';

export async function GET(request: Request) {
  const account = new URL(request.url).searchParams.get('account');
  if (account !== 'work' && account !== 'personal') {
    return NextResponse.json({ error: 'conta inválida' }, { status: 400 });
  }
  try {
    const folders = await listFolders(account as Account);
    return NextResponse.json({ folders });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
