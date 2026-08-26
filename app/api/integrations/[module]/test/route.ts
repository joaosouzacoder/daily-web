import { NextRequest, NextResponse } from 'next/server';
import { requireConnection } from '@/lib/api/context';
import { isModuleId, type ModuleId } from '@/lib/modules';
import type { Connection } from '@/lib/vault/connections';
import * as imap from '@/lib/integrations/imap';
import * as agenda from '@/lib/integrations/agenda';
import * as jiraApi from '@/lib/integrations/jiraApi';
import * as githubApi from '@/lib/integrations/githubApi';

// Tarefas não entram: o provedor local não tem o que testar, e o mstodo já
// responde na primeira leitura do painel.
const TESTERS: Partial<Record<ModuleId, (conn: Connection) => Promise<void>>> = {
  email: imap.testConnection,
  agenda: agenda.testConnection,
  jira: jiraApi.testConnection,
  pulls: githubApi.testConnection,
};

/**
 * Diz na hora se a credencial funciona. Sem isto, configurar uma caixa de
 * e-mail é preencher um formulário e esperar o próximo ciclo do refresher
 * para descobrir que a senha estava errada.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ module: string }> },
) {
  const { module: moduleParam } = await params;
  if (!isModuleId(moduleParam)) {
    return NextResponse.json({ error: 'módulo desconhecido' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const guard = await requireConnection(moduleParam, body?.id);
  if (!guard.ok) return guard.response;

  const tester = TESTERS[moduleParam];
  if (!tester) return NextResponse.json({ ok: true, message: 'nada a testar' });

  try {
    await tester(guard.value.connection);
    return NextResponse.json({ ok: true, message: 'conexão funcionando' });
  } catch (err) {
    // 200 de propósito: o teste rodou e o resultado é "não funcionou". Um
    // status de erro faria a tela tratar como falha da própria app.
    return NextResponse.json({
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
