import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { moduleStates, setModuleEnabled } from '@/lib/vault/connections';
import { isModuleId } from '@/lib/modules';
import { dropCache } from '@/lib/refresher';

/** Liga e desliga o módulo. Desligar preserva a credencial: quem tira o Jira
 *  da tela por uma semana não quer redigitar o token na volta. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ module: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { module: moduleParam } = await params;
  if (!isModuleId(moduleParam)) {
    return NextResponse.json({ error: 'módulo desconhecido' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled precisa ser booleano' }, { status: 400 });
  }

  setModuleEnabled(auth.value.id, moduleParam, body.enabled);
  dropCache(auth.value.id);
  return NextResponse.json({ modules: moduleStates(auth.value.id) });
}
