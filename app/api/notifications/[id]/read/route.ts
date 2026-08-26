import { NextResponse } from 'next/server';
import { markRead } from '@/lib/notifications';
import { getCurrentUser } from '@/lib/auth/currentUser';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  try {
    markRead(user.id, 'jira_mention', id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
