import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { moduleStates } from '@/lib/vault/connections';
import { isVaultConfigured } from '@/lib/vault/crypto';
import { MODULES } from '@/lib/modules';
import { isAvailable as mstodoAvailable } from '@/lib/cli/mstodo';

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    // Sem chave no env não dá para guardar nada; a tela precisa dizer isso em
    // vez de aceitar o formulário e falhar no submit.
    vaultReady: isVaultConfigured(),
    // A CLI do Microsoft To Do só existe onde alguém a instalou: oferecer o
    // provedor sem ela seria empurrar a pessoa para um erro.
    mstodoAvailable: await mstodoAvailable(),
    catalog: MODULES,
    modules: moduleStates(auth.value.id),
  });
}
