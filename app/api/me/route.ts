import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';

export async function GET() {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  return NextResponse.json({ username: current.username, isAdmin: current.isAdmin });
}
