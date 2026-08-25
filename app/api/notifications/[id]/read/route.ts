import { NextResponse } from 'next/server';
import { markRead } from '@/lib/notifications';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  markRead('jira_mention', id);
  return NextResponse.json({ ok: true });
}
