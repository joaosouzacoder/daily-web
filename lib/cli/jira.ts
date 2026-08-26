import { runCli } from './run';
import { parseIssues, type JiraFilter } from '@/lib/parsers/jira';
import { providerEnv } from '@/lib/vault/env';
import type { JiraItem } from '@/lib/types';

export async function fetchIssues(userId: string, filter: JiraFilter): Promise<JiraItem[]> {
  const { stdout } = await runCli('jira', ['issues', '--filter', filter], {
    env: providerEnv(userId, 'jira'),
  });
  return parseIssues(stdout);
}

export async function fetchMentions(userId: string): Promise<JiraItem[]> {
  const { stdout } = await runCli('jira', ['mentions'], { env: providerEnv(userId, 'jira') });
  return parseIssues(stdout);
}
