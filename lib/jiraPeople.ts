import type { Connection } from '@/lib/vault/connections';
import { enabledModules, listConnections } from '@/lib/vault/connections';
import { panel } from '@/lib/refresher';
import { fetchIssues, fetchDelivered, fetchApproved, fetchProblems } from '@/lib/integrations/jiraApi';
import type { JiraPersonView } from '@/lib/types';

/** A conexão do Jira de quem está logado, ou nula se o módulo está desligado
 *  ou sem conexão — o mesmo critério do refresher. */
export function jiraConnectionOf(userId: string): Connection | null {
  if (!enabledModules(userId).includes('jira')) return null;
  return listConnections(userId, 'jira')[0] ?? null;
}

export async function fetchPersonView(conn: Connection, accountId: string): Promise<JiraPersonView> {
  const subject = { kind: 'person' as const, accountId };
  
  const [jira, delivered, approved, problems] = await Promise.all([
    panel(() => fetchIssues(conn, 'both', subject)),
    panel(() => fetchDelivered(conn, subject)),
    panel(() => fetchApproved(conn, subject)),
    panel(() => fetchProblems(conn, subject)),
  ]);

  return {
    jira,
    delivered,
    approved,
    problems,
  };
}
