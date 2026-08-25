import type { Account, AgendaItem } from '@/lib/types';

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
