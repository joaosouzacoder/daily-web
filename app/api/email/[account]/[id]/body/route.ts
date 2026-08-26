import { NextResponse } from 'next/server';
import { fetchBody } from '@/lib/cli/himalaya';
import { getCachedBody, putCachedBody } from '@/lib/emailCache';
import { isValidAccount, isValidEmailId } from '@/lib/api/validation';
import { getCurrentUser } from '@/lib/auth/currentUser';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ account: string; id: string }> },
) {
  const { account, id } = await params;
  if (!isValidAccount(account) || !isValidEmailId(id)) {
    return NextResponse.json({ error: 'conta ou id inválido' }, { status: 400 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  // O corpo quase sempre já foi baixado pelo refresher: responde do banco
  // e só vai ao IMAP quando é um e-mail que o aquecimento ainda não pegou.
  const cached = getCachedBody(user.id, account, id);
  if (cached !== null) {
    return NextResponse.json({ text: cached, cached: true });
  }

  try {
    const text = await fetchBody(account, id);
    putCachedBody(user.id, account, id, text);
    return NextResponse.json({ text, cached: false });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
