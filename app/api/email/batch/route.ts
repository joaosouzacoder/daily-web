import { NextRequest, NextResponse } from 'next/server';
import { setSeen, applyTag, deleteEmails } from '@/lib/integrations/imap';
import { isValidEmailId, isValidFolder } from '@/lib/api/validation';
import { requireUser } from '@/lib/api/context';
import { findConnection, type Connection } from '@/lib/vault/connections';
import { patchCachedState } from '@/lib/refresher';
import { markEmailsSeen, removeEmails } from '@/lib/statePatches';

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

  const results: BatchTargetResult[] = [];
  // Os alvos válidos vão juntos por conta. O IMAP opera sobre um conjunto de
  // mensagens num comando só; mandar uma por vez abria uma conexão por
  // mensagem e o servidor recusava o lote com "too many simultaneous
  // connections" — foi assim que 24 de 27 exclusões falharam.
  const porConta = new Map<string, { connection: Connection; ids: string[] }>();

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

    const grupo = porConta.get(account) ?? { connection, ids: [] };
    grupo.ids.push(id);
    porConta.set(account, grupo);
  }

  // Uma conta por vez: em paralelo, cada conta abriria a sua conexão ao mesmo
  // tempo e o problema voltaria em escala menor.
  for (const [account, { connection, ids }] of porConta) {
    try {
      if (action === 'read') await setSeen(connection, ids, true);
      else if (action === 'unread') await setSeen(connection, ids, false);
      else if (action === 'delete') await deleteEmails(connection, ids);
      else if (action === 'move') await applyTag(connection, ids, folder as string);
      for (const id of ids) results.push({ account, id, ok: true });
    } catch (err) {
      // O comando vale para o conjunto inteiro: se ele falhou, nenhuma
      // mensagem daquela conta foi tocada.
      const error = err instanceof Error ? err.message : String(err);
      for (const id of ids) results.push({ account, id, ok: false, error });
    }
  }

  // Só os alvos que deram certo entram na correção: um e-mail que falhou
  // precisa continuar na tela, do jeito que está.
  const done = results.filter((r) => r.ok).map((r) => ({ account: r.account, id: r.id }));
  if (done.length > 0) {
    patchCachedState(auth.value.id, (state) => {
      if (action === 'read') return markEmailsSeen(state, done, true);
      if (action === 'unread') return markEmailsSeen(state, done, false);
      // Apagar tira da caixa; mover é uma cópia para a pasta escolhida, então
      // a mensagem continua na entrada, só marcada como lida.
      if (action === 'delete') return removeEmails(state, done);
      return markEmailsSeen(state, done, true);
    });
  }

  return NextResponse.json({ results });
}
