import { NextResponse } from 'next/server';
import { getCachedState, refreshAll } from '@/lib/refresher';
import { getCurrentUser } from '@/lib/auth/currentUser';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const state = getCachedState(user.id) ?? (await refreshAll(user.id));
  return NextResponse.json(state);
}
