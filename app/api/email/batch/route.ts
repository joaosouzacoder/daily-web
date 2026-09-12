import { NextRequest, NextResponse } from 'next/server';
import { isValidEmailId, isValidFolder } from '@/lib/api/validation';
import { requireUser } from '@/lib/api/context';
import { findConnection, type Connection } from '@/lib/vault/connections';
import { recordPendingAction, type PendingKind } from '@/lib/email/pendingActions';
import { replayPendingActions } from '@/lib/email/replay';

interface Target {
  account: unknown;
  id: unknown;
}

const VALID_ACTIONS = ['read', 'unread', 'move', 'delete'] as const;
type Action = (typeof VALID_ACTIONS)[number];

const KIND: Record<Action, PendingKind> = {
  read: 'seen',
  unread: 'unseen',
  move: 'move',
  delete: 'delete',
};

interface BatchTargetResult {
  account: string;
  id: string;
  ok: boolean;
  error?: string;
}

/**
 * A ação é aceita quando fica gravada, não quando chega ao servidor: o que o
 * usuário pediu passa a valer na hora e a escrita é levada — e repetida, se
 * preciso — pelo replay. Só o que nem chega a ser gravado responde erro aqui.
 */
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

  const results: BatchTargetResult[] = [];
  const conexoes = new Map<string, Connection>();

  for (const target of targets) {
    const account = String(target.account);
    const id = String(target.id);

    if (!isValidEmailId(target.id)) {
      results.push({ account, id, ok: false, error: 'id inválido' });
      continue;
    }
    // A conexão é buscada pelo dono da sessão, então um id de outra pessoa
    // simplesmente não existe aqui.
    const connection =
      typeof target.account === 'string' ? findConnection(auth.value.id, target.account) : null;
    if (!connection || connection.module !== 'email') {
      results.push({ account, id, ok: false, error: 'conta não encontrada' });
      continue;
    }

    recordPendingAction({
      userId: auth.value.id,
      account: connection.id,
      uid: id,
      kind: KIND[action],
      payload: action === 'move' ? (folder as string) : null,
    });
    conexoes.set(connection.id, connection);
    results.push({ account, id, ok: true });
  }

  if (conexoes.size > 0) {
    // A falha aqui não volta como erro: a intenção está gravada e o ciclo
    // seguinte tenta de novo. O que esgota as tentativas aparece na linha da
    // mensagem, que volta para a lista — ela não foi apagada de verdade.
    await replayPendingActions(auth.value.id, [...conexoes.values()]);
  }

  return NextResponse.json({ results });
}
