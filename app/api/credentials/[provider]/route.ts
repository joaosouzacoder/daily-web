import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import {
  setCredential,
  deleteCredential,
  credentialStatus,
  PROVIDERS,
  PROVIDER_FIELDS,
  type Provider,
} from '@/lib/vault/credentials';

function isProvider(value: string): value is Provider {
  return (PROVIDERS as string[]).includes(value);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { provider } = await params;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: 'provedor desconhecido' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const incoming = body?.values;
  if (!incoming || typeof incoming !== 'object') {
    return NextResponse.json({ error: 'valores obrigatórios' }, { status: 400 });
  }

  // Só campos declarados do provedor entram: sem isso, o cliente poderia
  // gravar chaves arbitrárias que depois virariam variáveis de ambiente.
  const values: Record<string, string> = {};
  for (const field of PROVIDER_FIELDS[provider]) {
    const value = incoming[field.name];
    if (typeof value === 'string' && value !== '') values[field.name] = value;
  }
  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: 'nenhum campo preenchido' }, { status: 400 });
  }

  try {
    setCredential(user.id, provider, values);
    return NextResponse.json({ credential: credentialStatus(user.id, provider) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { provider } = await params;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: 'provedor desconhecido' }, { status: 400 });
  }
  if (!deleteCredential(user.id, provider)) {
    return NextResponse.json({ error: 'credencial não encontrada' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
