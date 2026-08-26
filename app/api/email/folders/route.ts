import { NextRequest, NextResponse } from 'next/server';
import { listFolders } from '@/lib/integrations/imap';
import { requireConnection, upstreamError } from '@/lib/api/context';

export async function GET(request: NextRequest) {
  const account = new URL(request.url).searchParams.get('account');
  const guard = await requireConnection('email', account);
  if (!guard.ok) return guard.response;

  try {
    return NextResponse.json({ folders: await listFolders(guard.value.connection) });
  } catch (err) {
    return upstreamError(err);
  }
}
