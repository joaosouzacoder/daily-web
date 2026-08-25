import type { DashboardState, PanelResult } from '@/lib/types';
import { listEnvelopes } from './cli/himalaya';
import { fetchAgenda } from './cli/gcalcli';
import { fetchPulls } from './cli/pulls';
import { fetchIssues } from './cli/jira';
import { fetchTasks } from './cli/mstodo';
import { getNotifications } from './notifications';
import { getPomodoroState } from './pomodoro';
import { warmBodyCache, pruneOldBodies } from './emailCache';

const EMAIL_LIMIT = 30;
const JIRA_FILTER = 'both' as const;

async function panel<T>(fn: () => Promise<T>): Promise<PanelResult<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function mergedAccountsPanel<T>(
  work: () => Promise<T[]>,
  personal: () => Promise<T[]>,
): Promise<PanelResult<T[]>> {
  const [workResult, personalResult] = await Promise.allSettled([work(), personal()]);
  const data: T[] = [
    ...(workResult.status === 'fulfilled' ? workResult.value : []),
    ...(personalResult.status === 'fulfilled' ? personalResult.value : []),
  ];
  const errors = [workResult, personalResult]
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

  if (errors.length === 0) return { data, error: null };
  if (data.length === 0) return { data: null, error: errors.join('; ') };
  return { data, error: errors.join('; ') };
}

let cache: DashboardState | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export async function refreshAll(): Promise<DashboardState> {
  const [email, agenda, pulls, jira, tasks, notifications] = await Promise.all([
    mergedAccountsPanel(
      () => listEnvelopes('work', EMAIL_LIMIT),
      () => listEnvelopes('personal', EMAIL_LIMIT),
    ),
    mergedAccountsPanel(
      () => fetchAgenda('work'),
      () => fetchAgenda('personal'),
    ),
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

  // Baixa os corpos que ainda faltam em segundo plano, sem segurar a
  // resposta: quando o usuário clicar, o e-mail já estará no banco.
  if (email.data && email.data.length > 0) {
    void warmBodyCache(email.data)
      .then(() => pruneOldBodies())
      .catch(() => {
        // Aquecimento é oportunista: uma falha aqui não afeta o painel.
      });
  }

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
