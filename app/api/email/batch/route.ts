import { NextResponse } from 'next/server';
import { setSeen, moveTo, deleteEmail } from '@/lib/cli/himalaya';
import { isValidAccount, isValidEmailId, isValidFolder } from '@/lib/api/validation';

interface Target {
  account: unknown;
  id: unknown;
}

interface BatchTargetResult {
  account: string;
  id: string;
  ok: boolean;
  error?: string;
}

export async function POST(request: Request) {
  const body = await request.json();
  const targets: Target[] = body.targets ?? [];
  const action: 'read' | 'unread' | 'move' | 'delete' = body.action;
  const folder: string | undefined = body.folder;

  if (action === 'move' && !isValidFolder(folder)) {
    return NextResponse.json({ error: 'pasta obrigatória' }, { status: 400 });
  }

  const settled = await Promise.allSettled(
    targets.map(async (target): Promise<BatchTargetResult> => {
      const account = String(target.account);
      const id = String(target.id);

      if (!isValidAccount(target.account) || !isValidEmailId(target.id)) {
        return { account, id, ok: false, error: 'conta ou id inválido' };
      }

      try {
        if (action === 'read') await setSeen(target.account, target.id, true);
        else if (action === 'unread') await setSeen(target.account, target.id, false);
        else if (action === 'delete') await deleteEmail(target.account, target.id);
        else if (action === 'move') await moveTo(target.account, target.id, folder as string);
        return { account, id, ok: true };
      } catch (err) {
        return { account, id, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  const results: BatchTargetResult[] = settled.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : { account: 'unknown', id: 'unknown', ok: false, error: r.reason instanceof Error ? r.reason.message : String(r.reason) },
  );

  return NextResponse.json({ results });
}
