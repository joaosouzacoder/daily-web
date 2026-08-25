import { runCli } from './run';
import { parseIssues, type JiraFilter } from '@/lib/parsers/jira';
import type { JiraItem } from '@/lib/types';

export async function fetchIssues(filter: JiraFilter): Promise<JiraItem[]> {
  const { stdout } = await runCli('jira', ['issues', '--filter', filter]);
  return parseIssues(stdout);
}

export async function fetchMentions(): Promise<JiraItem[]> {
  const { stdout } = await runCli('jira', ['mentions']);
  return parseIssues(stdout);
}
