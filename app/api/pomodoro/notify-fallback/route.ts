import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    return NextResponse.json({ sent: false });
  }
  const body = await request.json().catch(() => null);
  const message = body?.phase === 'rest' ? 'Hora de descansar' : 'Hora de focar';
  await fetch(`https://ntfy.sh/${topic}`, { method: 'POST', body: message }).catch(() => {});
  return NextResponse.json({ sent: true });
}
