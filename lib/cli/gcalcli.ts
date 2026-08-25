import path from 'node:path';
import os from 'node:os';
import { runCli } from './run';
import { parseAgendaTsv, computeAgendaWindow } from '@/lib/parsers/gcalcli';
import type { Account, AgendaItem } from '@/lib/types';

const ACCOUNT_ENV: Record<Account, string> = {
  work: 'WORK_CALENDAR_EMAIL',
  personal: 'PERSONAL_CALENDAR_EMAIL',
};

export async function fetchAgenda(account: Account): Promise<AgendaItem[]> {
  const calendar = process.env[ACCOUNT_ENV[account]] ?? '';
  if (!calendar) {
    throw new Error(`e-mail da calendar de ${account} não configurado (${ACCOUNT_ENV[account]})`);
  }
  const { start, end } = computeAgendaWindow();
  const dataHome = path.join(os.homedir(), '.local/share/gcalcli-accounts', account);

  const { stdout } = await runCli(
    'gcalcli',
    ['--calendar', calendar, 'agenda', start, end, '--tsv'],
    { env: { XDG_DATA_HOME: dataHome } },
  );
  return parseAgendaTsv(stdout, account);
}
