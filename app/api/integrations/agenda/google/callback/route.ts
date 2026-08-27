import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import {
  accountEmail,
  exchangeCode,
  googleClient,
  verifyState,
} from '@/lib/integrations/google/oauth';
import { listConnections, saveConnection, setModuleEnabled } from '@/lib/vault/connections';
import { dropCache } from '@/lib/refresher';

function back(message: string, ok: boolean): NextResponse {
  const origin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:8010';
  const url = new URL('/config', origin);
  url.searchParams.set(ok ? 'conectado' : 'erro', message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;

  // O Google avisa aqui quando a pessoa clicou em "cancelar".
  const denied = params.get('error');
  if (denied) {
    return back(denied === 'access_denied' ? 'autorização cancelada' : denied, false);
  }

  const secret = process.env.SESSION_SECRET;
  const state = params.get('state') ?? '';
  const code = params.get('code') ?? '';
  if (!secret || !code) return back('retorno do Google incompleto', false);

  const verified = verifyState(state, secret);
  if (!verified) return back('retorno do Google inválido ou expirado — tente conectar de novo', false);

  // A assinatura prova que o fluxo saiu daqui; comparar com a sessão atual
  // impede que o retorno seja concluído dentro da sessão de outra pessoa.
  const user = await getCurrentUser();
  if (!user || user.id !== verified.userId) {
    return back('a sessão mudou durante a autorização — entre e conecte de novo', false);
  }

  try {
    const { refreshToken, accessToken } = await exchangeCode(googleClient(), code);
    const email = await accountEmail(accessToken);

    // A conexão é identificada pela conta que autorizou. Reconectar a mesma
    // renova o acesso; autorizar outra soma uma agenda. Antes qualquer
    // conexão do Google era sobrescrita, então a segunda conta apagava a
    // primeira e só uma agenda existia por vez.
    const existing = listConnections(user.id, 'agenda').find(
      (c) => c.values.provider === 'google' && (c.values.account ?? '') === email,
    );

    saveConnection(
      user.id,
      'agenda',
      existing?.label ?? (email || 'Google Agenda'),
      { ...(existing?.values ?? {}), provider: 'google', refreshToken, account: email },
      existing?.id,
    );
    // Autorizar no Google é intenção explícita de usar a agenda. Sem isto,
    // quem tivesse desligado o módulo — porque o link iCal vivia falhando —
    // concluiria a autorização e continuaria sem painel nenhum na tela.
    setModuleEnabled(user.id, 'agenda', true);
    dropCache(user.id);
    return back('Google Agenda conectado', true);
  } catch (err) {
    return back(err instanceof Error ? err.message : String(err), false);
  }
}
