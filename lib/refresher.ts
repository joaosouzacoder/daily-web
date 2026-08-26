import type { DashboardState, PanelResult } from '@/lib/types';
import { listEnvelopes } from './cli/himalaya';
import { fetchAgenda } from './cli/gcalcli';
import { fetchPulls } from './cli/pulls';
import { fetchIssues } from './cli/jira';
import { fetchTasks } from './cli/mstodo';
import { getNotifications } from './notifications';
import { getPomodoroState } from './pomodoro';
import { warmBodyCache, pruneOldBodies } from './emailCache';
import { listUsers } from './auth/users';

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

// Um cache por usuário. Era uma variável só de módulo, o que fazia todo mundo
// que abrisse o painel ver os dados de quem tivesse atualizado por último.
const caches = new Map<string, DashboardState>();
let timer: ReturnType<typeof setInterval> | null = null;

export async function refreshAll(userId: string): Promise<DashboardState> {
  const [email, agenda, pulls, jira, tasks, notifications] = await Promise.all([
    mergedAccountsPanel(
      () => listEnvelopes('work', EMAIL_LIMIT),
      () => listEnvelopes('personal', EMAIL_LIMIT),
    ),
    mergedAccountsPanel(
      () => fetchAgenda('work'),
      () => fetchAgenda('personal'),
    ),
    panel(() => fetchPulls(userId)),
    panel(() => fetchIssues(userId, JIRA_FILTER)),
    panel(() => fetchTasks(userId)),
    panel(() => getNotifications(userId)),
  ]);

  const state: DashboardState = {
    updatedAt: new Date().toISOString(),
    email,
    agenda,
    pulls,
    jira,
    tasks,
    notifications,
    pomodoro: getPomodoroState(userId),
  };
  caches.set(userId, state);

  // Baixa os corpos que ainda faltam em segundo plano, sem segurar a
  // resposta: quando o usuário clicar, o e-mail já estará no banco.
  if (email.data && email.data.length > 0) {
    void warmBodyCache(userId, email.data)
      .catch(() => {
        // Aquecimento é oportunista: uma falha aqui não afeta o painel.
      });
  }

  return state;
}

export function getCachedState(userId: string): DashboardState | null {
  const cache = caches.get(userId);
  if (!cache) return null;
  return { ...cache, pomodoro: getPomodoroState(userId) };
}

// Atualiza todo mundo que está cadastrado. Com o punhado de usuários que esta
// app comporta isso é mais simples — e mais previsível — do que rastrear quem
// tem sessão aberta.
async function refreshEveryone(): Promise<void> {
  for (const user of listUsers()) {
    try {
      await refreshAll(user.id);
    } catch {
      // A falha de um usuário não pode interromper o ciclo dos outros.
    }
  }
  pruneOldBodies();
}

export function startRefreshLoop(intervalSeconds: number): void {
  if (timer) return;
  void refreshEveryone();
  timer = setInterval(() => void refreshEveryone(), intervalSeconds * 1000);
}

export function resetCachesForTests(): void {
  caches.clear();
  if (timer) clearInterval(timer);
  timer = null;
}
