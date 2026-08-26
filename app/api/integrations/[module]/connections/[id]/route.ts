import { NextRequest, NextResponse } from 'next/server';
import { requireConnection } from '@/lib/api/context';
import { deleteConnection, moduleStates, saveConnection } from '@/lib/vault/connections';
import { MODULES, isModuleId, validateValues } from '@/lib/modules';
import { dropCache } from '@/lib/refresher';
import { pickDeclaredValues } from '@/lib/api/connectionValues';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; id: string }> },
) {
  const { module: moduleParam, id } = await params;
  if (!isModuleId(moduleParam)) {
    return NextResponse.json({ error: 'módulo desconhecido' }, { status: 400 });
  }

  const guard = await requireConnection(moduleParam, id);
  if (!guard.ok) return guard.response;
  const { user, connection } = guard.value;

  const body = await request.json().catch(() => null);
  const incoming = body?.values;
  if (!incoming || typeof incoming !== 'object') {
    return NextResponse.json({ error: 'valores obrigatórios' }, { status: 400 });
  }

  const values = pickDeclaredValues(moduleParam, incoming as Record<string, unknown>);
  // Na edição os campos secretos podem vir em branco, querendo dizer "não
  // mexe" — a validação precisa considerar o que já está gravado.
  const errors = validateValues(moduleParam, { ...connection.values, ...values });
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
  }

  const label =
    typeof body.label === 'string' && body.label.trim() ? body.label.trim() : connection.label;

  saveConnection(user.id, moduleParam, label, values, id);
  dropCache(user.id);
  return NextResponse.json({ modules: moduleStates(user.id) });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ module: string; id: string }> },
) {
  const { module: moduleParam, id } = await params;
  if (!isModuleId(moduleParam)) {
    return NextResponse.json({ error: 'módulo desconhecido' }, { status: 400 });
  }

  const guard = await requireConnection(moduleParam, id);
  if (!guard.ok) return guard.response;
  const { user } = guard.value;

  deleteConnection(user.id, id);
  dropCache(user.id);
  return NextResponse.json({ modules: moduleStates(user.id), label: MODULES[moduleParam].label });
}
