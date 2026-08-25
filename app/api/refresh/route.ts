import { NextResponse } from 'next/server';
import { refreshAll } from '@/lib/refresher';

export async function POST() {
  const state = await refreshAll();
  return NextResponse.json(state);
}
