import type { DashboardState, PanelResult } from '@/lib/types';
import { listEnvelopes } from './cli/himalaya';
import { fetchAgenda } from './cli/gcalcli';
import { fetchPulls } from './cli/pulls';
import { fetchIssues } from './cli/jira';
import { fetchTasks } from './cli/mstodo';
import { getNotifications } from './notifications';
import { getPomodoroState } from './pomodoro';

const EMAIL_LIMIT = 30;
const JIRA_FILTER = 'both' as const;

async function panel<T>(fn: () => Promise<T>): Promise<PanelResult<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

let cache: DashboardState | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export async function refreshAll(): Promise<DashboardState> {
  const [email, agenda, pulls, jira, tasks, notifications] = await Promise.all([
    panel(async () => {
      const [work, personal] = await Promise.all([
        listEnvelopes('work', EMAIL_LIMIT),
        listEnvelopes('personal', EMAIL_LIMIT),
      ]);
      return [...work, ...personal];
    }),
    panel(async () => {
      const [work, personal] = await Promise.all([fetchAgenda('work'), fetchAgenda('personal')]);
      return [...work, ...personal];
    }),
    panel(() => fetchPulls()),
    panel(() => fetchIssues(JIRA_FILTER)),
    panel(() => fetchTasks()),
    panel(() => getNotifications()),
  ]);

  cache = {
    updatedAt: new Date().toISOString(),
    email,
    agenda,
    pulls,
    jira,
    tasks,
    notifications,
    pomodoro: getPomodoroState(),
  };
  return cache;
}

export function getCachedState(): DashboardState | null {
  if (!cache) return null;
  return { ...cache, pomodoro: getPomodoroState() };
}

export function startRefreshLoop(intervalSeconds: number): void {
  if (timer) return;
  void refreshAll();
  timer = setInterval(() => void refreshAll(), intervalSeconds * 1000);
}
