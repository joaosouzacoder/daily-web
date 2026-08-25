import path from 'node:path';
import os from 'node:os';
import { runCli } from './run';
import { parseAgendaTsv } from '@/lib/parsers/gcalcli';
import type { Account, AgendaItem } from '@/lib/types';

const ACCOUNT_ENV: Record<Account, string> = {
  work: 'WORK_CALENDAR_EMAIL',
  personal: 'PERSONAL_CALENDAR_EMAIL',
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function fetchAgenda(account: Account): Promise<AgendaItem[]> {
  const calendar = process.env[ACCOUNT_ENV[account]] ?? '';
  if (!calendar) {
    throw new Error(`e-mail da calendar de ${account} não configurado (${ACCOUNT_ENV[account]})`);
  }
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  const dataHome = path.join(os.homedir(), '.local/share/gcalcli-accounts', account);

  const { stdout } = await runCli(
    'gcalcli',
    ['--calendar', calendar, 'agenda', toIsoDate(today), toIsoDate(end), '--tsv'],
    { env: { XDG_DATA_HOME: dataHome } },
  );
  return parseAgendaTsv(stdout, account);
}
