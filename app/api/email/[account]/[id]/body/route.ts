import { NextResponse } from 'next/server';
import { fetchBody } from '@/lib/integrations/imap';
import { getCachedBody, putCachedBody } from '@/lib/emailCache';
import { isValidEmailId } from '@/lib/api/validation';
import { requireConnection, upstreamError } from '@/lib/api/context';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ account: string; id: string }> },
) {
  const { account, id } = await params;
  if (!isValidEmailId(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const guard = await requireConnection('email', account);
  if (!guard.ok) return guard.response;
  const { user, connection } = guard.value;

  // O corpo quase sempre já foi baixado pelo refresher: responde do banco
  // e só vai ao IMAP quando é um e-mail que o aquecimento ainda não pegou.
  const cached = getCachedBody(user.id, account, id);
  if (cached !== null) {
    return NextResponse.json({ text: cached, cached: true });
  }

  try {
    const text = await fetchBody(connection, id);
    putCachedBody(user.id, account, id, text);
    return NextResponse.json({ text, cached: false });
  } catch (err) {
    return upstreamError(err);
  }
}
