import { NextRequest, NextResponse } from 'next/server';
import { requireConnection, upstreamError } from '@/lib/api/context';
import { getMailboxes } from '@/lib/email/mailboxes';

/** A árvore de pastas da conta, com o total e os não lidos de cada uma. */
export async function GET(request: NextRequest) {
  const account = new URL(request.url).searchParams.get('account');
  const guard = await requireConnection('email', account);
  if (!guard.ok) return guard.response;

  try {
    const mailboxes = await getMailboxes(guard.value.user.id, guard.value.connection);
    return NextResponse.json({ mailboxes });
  } catch (err) {
    return upstreamError(err);
  }
}
