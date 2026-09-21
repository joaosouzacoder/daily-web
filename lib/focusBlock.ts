export const FOCUS_DRAG_TYPE = 'application/x-daily-web-focus';

export type FocusSource = {
  kind: 'task' | 'jira' | 'pull';
  ref: string;
  title: string;
  url?: string;
};

export const DURATIONS = [25, 50, 90, 120] as const;

export function parseFocusSource(raw: string): FocusSource | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object') return null;
    const source = value as Record<string, unknown>;
    if (source.kind !== 'task' && source.kind !== 'jira' && source.kind !== 'pull') return null;
    if (typeof source.ref !== 'string' || source.ref.trim().length > 64) return null;
    if (
      typeof source.title !== 'string' ||
      source.title.trim().length === 0 ||
      source.title.trim().length > 200
    ) return null;
    if (source.url !== undefined) {
      if (typeof source.url !== 'string') return null;
      const url = new URL(source.url);
      if (url.protocol !== 'https:') return null;
    }
    return {
      kind: source.kind,
      ref: source.ref.trim(),
      title: source.title.trim(),
      ...(typeof source.url === 'string' ? { url: source.url } : {}),
    };
  } catch {
    return null;
  }
}

export function defaultStart(now: Date): Date {
  const result = new Date(now);
  result.setSeconds(0, 0);
  const minutes = result.getMinutes();
  result.setMinutes(minutes <= 20 ? 30 : 60, 0, 0);
  if (result.getHours() > 20 || (result.getHours() === 20 && result.getMinutes() > 0)) {
    result.setDate(result.getDate() + 1);
    result.setHours(9, 0, 0, 0);
  }
  return result;
}
