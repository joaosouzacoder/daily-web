import { NextResponse } from 'next/server';
import { getCachedState, refreshAll } from '@/lib/refresher';

export async function GET() {
  const state = getCachedState() ?? (await refreshAll());
  return NextResponse.json(state);
}
