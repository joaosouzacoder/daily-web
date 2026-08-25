import { NextResponse } from 'next/server';
import { listFolders } from '@/lib/cli/himalaya';
import type { Account } from '@/lib/types';

export async function GET(request: Request) {
  const account = new URL(request.url).searchParams.get('account');
  if (account !== 'work' && account !== 'personal') {
    return NextResponse.json({ error: 'conta inválida' }, { status: 400 });
  }
  const folders = await listFolders(account as Account);
  return NextResponse.json({ folders });
}
