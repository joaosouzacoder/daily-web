import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { allStatuses, PROVIDER_FIELDS } from '@/lib/vault/credentials';
import { isVaultConfigured } from '@/lib/vault/crypto';
import { isMachineOwner } from '@/lib/vault/env';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  return NextResponse.json({
    // Sem chave no env não dá para guardar nada; a tela precisa dizer isso em
    // vez de aceitar o formulário e falhar no submit.
    vaultReady: isVaultConfigured(),
    // O dono da máquina herda as variáveis do serviço quando não cadastrou
    // nada — a tela mostra isso para ele não achar que está desconfigurado.
    inheritsMachineEnv: isMachineOwner(user.id),
    fields: PROVIDER_FIELDS,
    credentials: allStatuses(user.id),
  });
}
