import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { notesSyncStatus } from '@/lib/notesSync';

/** Situação da cópia no Drive, sem as notas: a tela relê isto enquanto a
 *  pessoa digita, e devolver as notas junto sobrescreveria o rascunho. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ sync: notesSyncStatus(auth.value.id) });
}
