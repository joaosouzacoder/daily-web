import { NextResponse } from 'next/server';
import { pausePomodoro } from '@/lib/pomodoro';
import { getCurrentUser } from '@/lib/auth/currentUser';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  try {
    return NextResponse.json(pausePomodoro(user.id));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
