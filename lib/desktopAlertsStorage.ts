import type { AlertSource, SeenState } from '@/lib/desktopAlerts';

const SEEN_KEY = 'daily-web.desktop-alerts.v1';
const ENABLED_KEY = 'daily-web.desktop-alerts.enabled';
const SOURCES: AlertSource[] = ['email', 'jira', 'jiraProblem', 'pull', 'review', 'agenda', 'slack'];

function emptySeen(): SeenState {
  return { v: 1, sources: {}, reminders: [] };
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validSeen(value: unknown): value is SeenState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.v !== 1 || !stringArray(candidate.reminders)) return false;
  if (!candidate.sources || typeof candidate.sources !== 'object' || Array.isArray(candidate.sources)) {
    return false;
  }
  const sources = candidate.sources as Record<string, unknown>;
  return Object.entries(sources).every(
    ([source, keys]) => SOURCES.includes(source as AlertSource) && stringArray(keys),
  );
}

export function loadSeen(): SeenState {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return emptySeen();
    const parsed: unknown = JSON.parse(raw);
    return validSeen(parsed) ? parsed : emptySeen();
  } catch {
    return emptySeen();
  }
}

export function saveSeen(seen: SeenState): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // A linha de base volta a ser feita com segurança se o navegador recusar armazenamento.
  }
}

export function isEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // O estado da sessão ainda funciona quando o navegador recusa armazenamento.
  }
}
