import { NextResponse } from 'next/server';
import { startPomodoro } from '@/lib/pomodoro';

export async function POST() {
  return NextResponse.json(startPomodoro());
}
