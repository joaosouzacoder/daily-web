import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { countConnections, moduleStates, saveConnection } from '@/lib/vault/connections';
import { MODULES, isModuleId, validateValues } from '@/lib/modules';
import { pickDeclaredValues } from '@/lib/api/connectionValues';
import { dropCache } from '@/lib/refresher';

export async function POST(
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
  const incoming = body?.values;
  if (!incoming || typeof incoming !== 'object') {
    return NextResponse.json({ error: 'valores obrigatórios' }, { status: 400 });
  }

  const spec = MODULES[moduleParam];
  // Um módulo de conexão única não pode acumular registros: o segundo POST
  // seria uma configuração fantasma, nunca lida.
  if (!spec.multi && countConnections(auth.value.id, moduleParam) > 0) {
    return NextResponse.json(
      { error: `${spec.label} aceita só uma conexão — edite a que já existe` },
      { status: 409 },
    );
  }

  const values = pickDeclaredValues(moduleParam, incoming as Record<string, unknown>);
  const errors = validateValues(moduleParam, values);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
  }

  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : spec.label;

  try {
    saveConnection(auth.value.id, moduleParam, label, values);
    // O painel guarda o estado anterior em cache; sem invalidar, a conexão
    // nova só apareceria no próximo ciclo do refresher.
    dropCache(auth.value.id);
    return NextResponse.json({ modules: moduleStates(auth.value.id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
