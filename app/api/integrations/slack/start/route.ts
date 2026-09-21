import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { signOAuthState } from '@/lib/integrations/oauthState';
import {
  isSlackConfigured,
  slackAuthorizationUrl,
} from '@/lib/integrations/slack/oauth';

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  if (!isSlackConfigured()) {
    return NextResponse.json(
      { error: 'a conexão com o Slack não está configurada neste servidor' },
      { status: 503 },
    );
  }
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SESSION_SECRET não configurado' }, { status: 500 });
  }

  const state = signOAuthState(auth.value.id, 'slack', secret);
  return NextResponse.redirect(slackAuthorizationUrl(state));
}
