import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { findConnection, type Connection } from '@/lib/vault/connections';
import type { User } from '@/lib/auth/users';
import type { ModuleId } from '@/lib/modules';

export type Guard<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

function deny(error: string, status: number): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

export async function requireUser(): Promise<Guard<User>> {
  const user = await getCurrentUser();
  if (!user) return deny('não autenticado', 401);
  return { ok: true, value: user };
}

export interface ConnectionContext {
  user: User;
  connection: Connection;
}

/**
 * Resolve uma conexão sempre pelo dono da sessão. É o ponto em que o
 * multiusuário deixa de ser só organização e vira isolamento: um id de
 * conexão de outra pessoa não é "proibido", é inexistente — a consulta filtra
 * por user_id, então não há resposta que revele que aquele id existe.
 */
export async function requireConnection(
  moduleId: ModuleId,
  id: unknown,
): Promise<Guard<ConnectionContext>> {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  if (typeof id !== 'string' || id.length === 0) {
    return deny('conexão não informada', 400);
  }

  const connection = findConnection(auth.value.id, id);
  if (!connection || connection.module !== moduleId) {
    return deny('conexão não encontrada', 404);
  }
  return { ok: true, value: { user: auth.value, connection } };
}

/** Erro de integração vira 502: o pedido estava certo, quem falhou foi o
 *  serviço do outro lado. */
export function upstreamError(err: unknown): NextResponse {
  return NextResponse.json(
    { error: err instanceof Error ? err.message : String(err) },
    { status: 502 },
  );
}
