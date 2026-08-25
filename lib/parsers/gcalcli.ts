import type { Account, AgendaItem } from '@/lib/types';

export interface AgendaWindow {
  start: string;
  end: string;
}

// Usa os getters locais (não toISOString, que trunca em UTC) para que a
// janela de agenda comece/termine na data local do usuário — mesmo fix
// aplicado em lib/taskGrouping.ts's toLocalDateString.
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computeAgendaWindow(now: Date = new Date()): AgendaWindow {
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return { start: toLocalDateString(now), end: toLocalDateString(end) };
}

export function parseAgendaTsv(tsv: string, account: Account): AgendaItem[] {
  return tsv
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .filter((line) => !line.startsWith('start_date'))
    .flatMap((line) => {
      const cols = line.split('\t');
      const date = (cols[0] ?? '').trim();
      const time = (cols[1] ?? '').trim();
      const title = (cols[4] ?? '').trim();
      if (!date) return [];
      return [{ account, date, time, title }];
    });
}
