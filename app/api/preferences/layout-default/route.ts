import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/context';
import { defaultLayout } from '@/lib/dashboardLayout';

/** A disposição padrão, para a tela poder dizer se algo foi mexido sem
 *  duplicar a definição no cliente. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ layout: defaultLayout() });
}
