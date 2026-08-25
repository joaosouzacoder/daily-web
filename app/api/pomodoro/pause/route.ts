import { NextResponse } from 'next/server';
import { pausePomodoro } from '@/lib/pomodoro';

export async function POST() {
  return NextResponse.json(pausePomodoro());
}
