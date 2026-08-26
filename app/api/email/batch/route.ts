import { NextRequest, NextResponse } from 'next/server';
import { setSeen, applyTag, deleteEmail } from '@/lib/integrations/imap';
import { isValidEmailId, isValidFolder } from '@/lib/api/validation';
import { requireUser } from '@/lib/api/context';
import { findConnection } from '@/lib/vault/connections';

interface Target {
  account: unknown;
  id: unknown;
}

const VALID_ACTIONS = ['read', 'unread', 'move', 'delete'] as const;
type Action = (typeof VALID_ACTIONS)[number];

interface BatchTargetResult {
  account: string;
  id: string;
  ok: boolean;
  error?: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const targets: Target[] = Array.isArray(body?.targets) ? body.targets : [];
  const action = body?.action as Action;
  const folder: string | undefined = body?.folder;

  if (!(VALID_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: 'ação inválida' }, { status: 400 });
  }
  if (action === 'move' && !isValidFolder(folder)) {
    return NextResponse.json({ error: 'pasta obrigatória' }, { status: 400 });
  }

  const settled = await Promise.allSettled(
    targets.map(async (target): Promise<BatchTargetResult> => {
      const account = String(target.account);
      const id = String(target.id);

      if (!isValidEmailId(target.id)) {
        return { account, id, ok: false, error: 'id inválido' };
      }
      // A conexão é buscada pelo dono da sessão, então um id de outra pessoa
      // simplesmente não existe aqui.
      const connection =
        typeof target.account === 'string' ? findConnection(auth.value.id, target.account) : null;
      if (!connection || connection.module !== 'email') {
        return { account, id, ok: false, error: 'conta não encontrada' };
      }

      try {
        if (action === 'read') await setSeen(connection, id, true);
        else if (action === 'unread') await setSeen(connection, id, false);
        else if (action === 'delete') await deleteEmail(connection, id);
        else if (action === 'move') await applyTag(connection, id, folder as string);
        return { account, id, ok: true };
      } catch (err) {
        return { account, id, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  const results: BatchTargetResult[] = settled.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          account: 'unknown',
          id: 'unknown',
          ok: false,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        },
  );

  return NextResponse.json({ results });
}
