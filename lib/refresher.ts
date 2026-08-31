import type { DashboardState, MailboxRef, PanelResult } from '@/lib/types';
import * as imap from './integrations/imap';
import * as agendaSource from './integrations/agenda';
import * as jiraApi from './integrations/jiraApi';
import * as githubApi from './integrations/githubApi';
import { fetchTasks } from './tasks';
import { combineNotifications, getNotifications } from './notifications';
import { getPomodoroState } from './pomodoro';
import { warmBodyCache, pruneOldBodies } from './emailCache';
import { listUsers } from './auth/users';
import { enabledModules, listConnections } from './vault/connections';
import { agendaDays, dashboardLayout, dashboardLayouts, jiraWatchedKeys } from './preferences';
import type { Connection } from './vault/connections';

const EMAIL_LIMIT = 30;
const JIRA_FILTER = 'both' as const;

/** Módulo desligado não é erro nem lista vazia: é ausência. O painel some da
 *  tela em vez de mostrar "nada por aqui" para quem nunca quis aquilo. */
const OFF: PanelResult<never> = { data: null, error: null };

async function panel<T>(fn: () => Promise<T>): Promise<PanelResult<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Junta o resultado de várias conexões do mesmo módulo. Uma caixa fora do ar
 *  não pode apagar as outras da tela, então o sucesso parcial devolve dados e
 *  erro ao mesmo tempo. */
async function mergeConnections<T>(
  connections: Connection[],
  fn: (conn: Connection) => Promise<T[]>,
): Promise<PanelResult<T[]>> {
  if (connections.length === 0) return { data: [], error: null };

  const settled = await Promise.allSettled(connections.map((conn) => fn(conn)));
  const data = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const errors = settled
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
  const modules = enabledModules(userId);
  const has = (id: string) => modules.includes(id as never);

  const mailConnections = has('email') ? listConnections(userId, 'email') : [];
  const calendars = has('agenda') ? listConnections(userId, 'agenda') : [];
  const days = agendaDays(userId);
  const jiraConnection = has('jira') ? (listConnections(userId, 'jira')[0] ?? null) : null;
  const pullsConnection = has('pulls') ? (listConnections(userId, 'pulls')[0] ?? null) : null;

  const watched = jiraConnection ? jiraWatchedKeys(userId) : [];

  const [email, agenda, pulls, jira, tasks, mentions, jiraWatched, jiraDelivered] = await Promise.all([
    has('email') ? mergeConnections(mailConnections, (c) => imap.listEnvelopes(c, EMAIL_LIMIT)) : OFF,
    has('agenda')
      ? mergeConnections(calendars, (c) => agendaSource.fetchAgenda(c, undefined, days))
      : OFF,
    pullsConnection ? panel(() => githubApi.fetchPulls(pullsConnection)) : OFF,
    jiraConnection ? panel(() => jiraApi.fetchIssues(jiraConnection, JIRA_FILTER)) : OFF,
    has('tasks') ? panel(() => fetchTasks(userId)) : OFF,
    jiraConnection ? panel(() => getNotifications(userId, jiraConnection)) : OFF,
    jiraConnection && watched.length > 0
      ? panel(() => jiraApi.fetchByKeys(jiraConnection, watched))
      : ({ data: [], error: null } as PanelResult<never[]>),
    jiraConnection ? panel(() => jiraApi.fetchDeliveredToday(jiraConnection)) : OFF,
  ]);

  // O sino soma menção do Jira, pull request aberto e e-mail não lido. As
  // três já foram buscadas acima: o aviso é derivado, não é uma quarta ida.
  const notifications = combineNotifications(userId, mentions, pulls, email);

  const mailboxes: MailboxRef[] = mailConnections.map((c) => ({ id: c.id, label: c.label }));

  const state: DashboardState = {
    updatedAt: new Date().toISOString(),
    modules,
    mailboxes,
    agendaDays: days,
    layout: dashboardLayout(userId),
    layouts: dashboardLayouts(userId),
    email,
    agenda,
    pulls,
    jira,
    jiraWatched,
    jiraDelivered,
    tasks,
    notifications,
    pomodoro: getPomodoroState(userId),
  };
  caches.set(userId, state);

  // Baixa os corpos que ainda faltam em segundo plano, sem segurar a
  // resposta: quando o usuário clicar, o e-mail já estará no banco.
  if (email.data && email.data.length > 0) {
    void warmBodyCache(userId, mailConnections, email.data).catch(() => {
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

export function dropCache(userId: string): void {
  caches.delete(userId);
}

/**
 * Corrige o cache logo depois de uma ação. Sem isto, o painel recarrega e
 * recebe de volta o estado anterior — a ação parece não ter acontecido até o
 * próximo ciclo do refresher, que pode estar a minutos de distância.
 */
export function patchCachedState(
  userId: string,
  patch: (state: DashboardState) => DashboardState,
): void {
  const cache = caches.get(userId);
  if (!cache) return;
  caches.set(userId, patch(cache));
}

/** Recarrega só as tarefas. É barato no provedor local (SQLite) e, no
 *  mstodo, custa a mesma CLI que a ação já pagou — muito menos do que refazer
 *  e-mail, agenda, Jira e GitHub por causa de um checkbox. */
export async function refreshTasks(userId: string): Promise<void> {
  const cache = caches.get(userId);
  if (!cache) return;
  const tasks = await panel(() => fetchTasks(userId));
  caches.set(userId, { ...cache, tasks });
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
