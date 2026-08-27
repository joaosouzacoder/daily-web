import { getDb } from './db';
import { DEFAULT_AGENDA_DAYS, isAgendaRange } from './agendaWindow';
import { defaultLayout, parseLayout, serializeLayout } from './dashboardLayout';
import type { PanelPlacement } from './dashboardLayout';

// Preferências de visualização por usuário. São escolhas de como olhar, não
// de credencial: por isso não passam pelo cofre e não são cifradas.

export const AGENDA_DAYS = 'agendaDays';
export const DASHBOARD_LAYOUT = 'dashboardLayout';

function read(userId: string, key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM preferences WHERE user_id = ? AND key = ?')
    .get(userId, key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setPreference(userId: string, key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO preferences (user_id, key, value, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, key)
       DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(userId, key, value, new Date().toISOString());
}

/** Quantos dias a agenda cobre para este usuário. Um valor fora da lista
 *  conhecida — de uma versão antiga, ou escrito à mão no banco — vira o
 *  padrão em vez de virar uma janela absurda. */
export function agendaDays(userId: string): number {
  const stored = Number(read(userId, AGENDA_DAYS));
  return isAgendaRange(stored) ? stored : DEFAULT_AGENDA_DAYS;
}

export function setAgendaDays(userId: string, days: number): void {
  setPreference(userId, AGENDA_DAYS, String(days));
}

/** Disposição dos painéis na grade. Um JSON ilegível — de uma versão antiga
 *  ou de escrita manual — vira o padrão em vez de deixar a tela em branco. */
export function dashboardLayout(userId: string): PanelPlacement[] {
  const bruto = read(userId, DASHBOARD_LAYOUT);
  if (!bruto) return defaultLayout();
  try {
    return parseLayout(JSON.parse(bruto));
  } catch {
    return defaultLayout();
  }
}

export function setDashboardLayout(userId: string, layout: PanelPlacement[]): void {
  setPreference(userId, DASHBOARD_LAYOUT, serializeLayout(layout));
}

export function resetDashboardLayout(userId: string): void {
  getDb()
    .prepare('DELETE FROM preferences WHERE user_id = ? AND key = ?')
    .run(userId, DASHBOARD_LAYOUT);
}

export function deleteUserPreferences(userId: string): void {
  getDb().prepare('DELETE FROM preferences WHERE user_id = ?').run(userId);
}

export const JIRA_WATCHED = 'jiraWatchedKeys';

/** Uma chave do Jira: letras, hífen, números. Vale validar aqui porque ela
 *  entra numa JQL, e um valor livre ali seria injeção de consulta. */
const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/;

export function isJiraKey(value: unknown): value is string {
  return typeof value === 'string' && JIRA_KEY_PATTERN.test(value.toUpperCase());
}

/** Issues que a pessoa quer acompanhar mesmo não sendo dela — o Jira do time
 *  vizinho que trava o seu, a issue que você abriu para outro alguém. */
export function jiraWatchedKeys(userId: string): string[] {
  const bruto = read(userId, JIRA_WATCHED);
  if (!bruto) return [];
  return bruto
    .split(',')
    .map((k) => k.trim().toUpperCase())
    .filter(isJiraKey);
}

export function setJiraWatchedKeys(userId: string, keys: string[]): void {
  // Sem duplicatas e sempre em caixa alta: o Jira não diferencia, e a lista
  // não deve mostrar TT-1 e tt-1 como duas coisas.
  const limpas = [...new Set(keys.map((k) => k.trim().toUpperCase()).filter(isJiraKey))];
  setPreference(userId, JIRA_WATCHED, limpas.join(','));
}
