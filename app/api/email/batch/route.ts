import { NextResponse } from 'next/server';
import { setSeen, moveTo, deleteEmail } from '@/lib/cli/himalaya';
import type { Account } from '@/lib/types';

interface Target {
  account: Account;
  id: string;
}

export async function POST(request: Request) {
  const body = await request.json();
  const targets: Target[] = body.targets ?? [];
  const action: 'read' | 'unread' | 'move' | 'delete' = body.action;
  const folder: string | undefined = body.folder;

  if (action === 'move' && !folder) {
    return NextResponse.json({ error: 'pasta obrigatória' }, { status: 400 });
  }

  for (const target of targets) {
    if (action === 'read') await setSeen(target.account, target.id, true);
    else if (action === 'unread') await setSeen(target.account, target.id, false);
    else if (action === 'delete') await deleteEmail(target.account, target.id);
    else if (action === 'move') await moveTo(target.account, target.id, folder as string);
  }
  return NextResponse.json({ ok: true });
}
