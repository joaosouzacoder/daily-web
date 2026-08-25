import { NextRequest, NextResponse } from 'next/server';
import { listTrackedRepos, addTrackedRepo, removeTrackedRepo } from '@/lib/cli/pulls';
import { isValidRepo } from '@/lib/api/validation';

export async function GET() {
  try {
    const repos = await listTrackedRepos();
    return NextResponse.json({ repos });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!isValidRepo(body?.repo)) {
    return NextResponse.json({ error: 'repositório inválido (use owner/nome)' }, { status: 400 });
  }
  try {
    const repos = await addTrackedRepo(body.repo);
    return NextResponse.json({ repos });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!isValidRepo(body?.repo)) {
    return NextResponse.json({ error: 'repositório inválido (use owner/nome)' }, { status: 400 });
  }
  try {
    const repos = await removeTrackedRepo(body.repo);
    return NextResponse.json({ repos });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
