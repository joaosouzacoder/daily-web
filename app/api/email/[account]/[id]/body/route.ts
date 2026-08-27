import { NextResponse } from 'next/server';
import type { MailboxKind } from '@/lib/types';
import { fetchBody } from '@/lib/integrations/imap';
import { getCachedBody, putCachedBody } from '@/lib/emailCache';
import { splitQuoted } from '@/lib/parsers/mail';
import { isValidEmailId } from '@/lib/api/validation';
import { requireConnection, upstreamError } from '@/lib/api/context';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ account: string; id: string }> },
) {
  const { account, id } = await params;
  if (!isValidEmailId(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  // Sem a caixa, um uid de enviados seria buscado na entrada e devolveria o
  // corpo de outra mensagem. A lista de valores é fechada.
  const pedida = new URL(request.url).searchParams.get('box');
  if (pedida !== null && pedida !== 'inbox' && pedida !== 'sent') {
    return NextResponse.json({ error: 'caixa inválida' }, { status: 400 });
  }
  const mailbox: MailboxKind = pedida === 'sent' ? 'sent' : 'inbox';

  const guard = await requireConnection('email', account);
  if (!guard.ok) return guard.response;
  const { user, connection } = guard.value;

  // O corpo quase sempre já foi baixado pelo refresher: responde do banco
  // e só vai ao IMAP quando é um e-mail que o aquecimento ainda não pegou.
  // O cache guarda o corpo inteiro; a separação é feita na leitura, para uma
  // melhora no corte valer também para o que já está gravado.
  const cached = getCachedBody(user.id, account, id, mailbox);
  if (cached !== null) {
    return NextResponse.json({ ...splitQuoted(cached), cached: true });
  }

  try {
    const body = await fetchBody(connection, id, mailbox);
    putCachedBody(user.id, account, id, body, mailbox);
    return NextResponse.json({ ...splitQuoted(body), cached: false });
  } catch (err) {
    return upstreamError(err);
  }
}
