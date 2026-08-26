import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import {
  authorizationUrl,
  googleClient,
  GoogleNotConfiguredError,
  signState,
} from '@/lib/integrations/google/oauth';

/** Manda a pessoa para o Google. O `state` assinado carrega quem começou o
 *  fluxo, e é conferido na volta. */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SESSION_SECRET não configurado' }, { status: 500 });
  }

  try {
    const client = googleClient();
    const hint = new URL(request.url).searchParams.get('login_hint') ?? undefined;
    const state = signState(auth.value.id, secret);
    return NextResponse.redirect(authorizationUrl(client, state, hint));
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
