import { NextResponse } from 'next/server';
import { resetPomodoro } from '@/lib/pomodoro';

export async function POST() {
  return NextResponse.json(resetPomodoro());
}
