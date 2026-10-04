import { senderLabel } from '@/lib/email/fromEmail';
import type { EmailEnvelope, EmailThread } from '@/lib/types';

export type EmailGroupBy = 'none' | 'account' | 'sender' | 'date';

export const EMAIL_GROUP_BY: readonly EmailGroupBy[] = ['none', 'account', 'sender', 'date'];

export const EMAIL_GROUP_LABEL: Record<EmailGroupBy, string> = {
  none: 'Sem agrupar',
  account: 'Conta',
  sender: 'Remetente',
  date: 'Data',
};

export interface EmailThreadGroup {
  key: string;
  label: string;
  threads: EmailThread[];
}

type DateBucket = 'today' | 'yesterday' | 'week' | 'month' | 'older';

const DATE_BUCKET_LABEL: Record<DateBucket, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  week: 'Últimos 7 dias',
  month: 'Últimos 30 dias',
  older: 'Mais antigos',
};

const DAY_MS = 86_400_000;

function startOfLocalDay(instant: Date): number {
  return new Date(instant.getFullYear(), instant.getMonth(), instant.getDate()).getTime();
}

function dateBucket(iso: string, now: Date): DateBucket {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return 'older';
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(instant)) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'week';
  if (days < 30) return 'month';
  return 'older';
}

// A conversa entra no grupo de quem fala com o usuário por último, não de quem
// a começou: é a mensagem mais recente que pede resposta.
function latestReceived(thread: EmailThread): EmailEnvelope {
  const received = thread.messages.filter((m) => m.mailbox === 'inbox');
  const pool = received.length > 0 ? received : thread.messages;
  return pool.reduce((latest, m) => (m.date > latest.date ? m : latest));
}

function groupOf(thread: EmailThread, by: Exclude<EmailGroupBy, 'none'>, now: Date) {
  if (by === 'date') {
    const bucket = dateBucket(thread.lastDate, now);
    return { key: bucket, label: DATE_BUCKET_LABEL[bucket] };
  }
  const message = latestReceived(thread);
  if (by === 'account') return { key: message.account, label: message.accountLabel };
  const label = senderLabel(message.from);
  return { key: label.toLowerCase(), label };
}

/** Os grupos aparecem na ordem da primeira conversa de cada um, então seguem a
 *  ordenação escolhida em vez de impor outra. */
export function groupThreads(
  threads: EmailThread[],
  by: EmailGroupBy,
  now: Date,
): EmailThreadGroup[] {
  if (by === 'none') return [{ key: 'all', label: '', threads }];

  const groups = new Map<string, EmailThreadGroup>();
  for (const thread of threads) {
    const { key, label } = groupOf(thread, by, now);
    const group = groups.get(key);
    if (group) group.threads.push(thread);
    else groups.set(key, { key, label, threads: [thread] });
  }
  return [...groups.values()];
}

export function parseEmailGroupBy(raw: string | null): EmailGroupBy {
  return EMAIL_GROUP_BY.find((by) => by === raw) ?? 'none';
}
