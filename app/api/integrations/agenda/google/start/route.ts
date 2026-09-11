import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import {
  authorizationUrl,
  googleClient,
  GoogleNotConfiguredError,
  isGooglePurpose,
  signState,
} from '@/lib/integrations/google/oauth';

/** Manda a pessoa para o Google. O `state` assinado carrega quem começou o
 *  fluxo e para quê, e é conferido na volta. A rota mora sob a agenda porque
 *  a URI de retorno registrada no client é esta; as notas usam a mesma com
 *  `?purpose=notes`, sem exigir que o administrador registre outra. */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SESSION_SECRET não configurado' }, { status: 500 });
  }

  try {
    const client = googleClient();
    const query = new URL(request.url).searchParams;
    const hint = query.get('login_hint') ?? undefined;
    const requested = query.get('purpose') ?? 'agenda';
    if (!isGooglePurpose(requested)) {
      return NextResponse.json({ error: 'finalidade desconhecida' }, { status: 400 });
    }
    const state = signState(auth.value.id, secret, Date.now(), requested);
    return NextResponse.redirect(authorizationUrl(client, state, hint, requested));
  } catch (err) {
    if (err instanceof GoogleNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
