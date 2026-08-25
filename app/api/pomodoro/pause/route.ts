import { NextResponse } from 'next/server';
import { pausePomodoro } from '@/lib/pomodoro';

export async function POST() {
  try {
    return NextResponse.json(pausePomodoro());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
