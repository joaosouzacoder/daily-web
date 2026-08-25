import { NextResponse } from 'next/server';
import { resetPomodoro } from '@/lib/pomodoro';

export async function POST() {
  try {
    return NextResponse.json(resetPomodoro());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
