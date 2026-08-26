import { NextRequest, NextResponse } from 'next/server';
import { fetchBody } from '@/lib/cli/himalaya';
import { getCachedBody, putCachedBody } from '@/lib/emailCache';
import { draftReply, MissingApiKeyError } from '@/lib/ai/replyDraft';
import { isValidAccount, isValidEmailId } from '@/lib/api/validation';
import { getCurrentUser } from '@/lib/auth/currentUser';

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  if (!isValidAccount(payload?.account) || !isValidEmailId(payload?.id)) {
    return NextResponse.json({ error: 'conta ou id inválido' }, { status: 400 });
  }
  const { account, id, from, subject, instruction } = payload;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  try {
    // Mesmo caminho do corpo exibido no acordeão: o refresher normalmente já
    // deixou o texto em cache, então gerar o rascunho não custa uma ida ao IMAP.
    let body = getCachedBody(user.id, account, id);
    if (body === null) {
      body = await fetchBody(account, id);
      putCachedBody(user.id, account, id, body);
    }
    const text = await draftReply({
      from: typeof from === 'string' ? from : '',
      subject: typeof subject === 'string' ? subject : '',
      body,
      instruction: typeof instruction === 'string' ? instruction : undefined,
    });
    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
