import { PROBLEM_LABEL } from '@/lib/parsers/jiraProblems';
import type { AgendaItem, DashboardState } from '@/lib/types';

export interface DesktopAlert {
  tag: string;
  title: string;
  body: string;
  url: string;
}

export type AlertSource = 'email' | 'jira' | 'jiraProblem' | 'pull' | 'review' | 'agenda' | 'slack';

export interface SeenState {
  v: 1;
  sources: Partial<Record<AlertSource, string[]>>;
  reminders: string[];
}

const SOURCES: AlertSource[] = ['email', 'jira', 'jiraProblem', 'pull', 'review', 'agenda', 'slack'];

function agendaKey(prefix: 'agenda' | 'reminder', item: AgendaItem): string {
  return `${prefix}:${item.account}|${item.date}|${item.time}|${item.title}`;
}

function agendaBody(item: AgendaItem): string {
  const [, month, day] = item.date.split('-');
  return `${day}/${month} ${item.time || 'dia inteiro'} — ${item.title}`;
}

/** As chaves de tudo que pode avisar agora, separadas por origem. */
export function currentAlerts(
  state: DashboardState,
): Record<AlertSource, Map<string, DesktopAlert> | null> {
  const email = state.email.data === null ? null : new Map<string, DesktopAlert>();
  for (const item of state.email.data ?? []) {
    if (item.mailbox !== 'inbox' || !item.unread) continue;
    const key = `email:${item.messageId || `${item.account}:${item.id}`}`;
    email?.set(key, {
      tag: key,
      title: 'Novo e-mail',
      body: `${item.from} — ${item.subject || '(sem assunto)'}`,
      url: '',
    });
  }

  const jira = state.jira.data === null ? null : new Map<string, DesktopAlert>();
  for (const item of state.jira.data ?? []) {
    if (item.role === 'reporter') continue;
    const key = `jira:${item.key}`;
    jira?.set(key, {
      tag: key,
      // A issue que só está na lista por esperar sua aprovação entra com o
      // papel neutro de responsável; o aviso diz o que ela realmente pede.
      title: item.awaitingApproval ? 'Aprovação pendente' : 'Nova issue no seu nome',
      body: `${item.key} — ${item.summary}`,
      url: item.url,
    });
  }

  const jiraProblem =
    state.jiraProblems.data === null ? null : new Map<string, DesktopAlert>();
  for (const item of state.jiraProblems.data ?? []) {
    for (const problem of item.problems) {
      const key = `jira-problem:${item.key}:${problem}`;
      jiraProblem?.set(key, {
        tag: key,
        title: 'Issue com problema',
        body: `${item.key} — ${PROBLEM_LABEL[problem]}`,
        url: item.url,
      });
    }
  }

  const pull = state.pulls.data === null ? null : new Map<string, DesktopAlert>();
  for (const item of state.pulls.data?.items ?? []) {
    if (!item.isPullRequest || item.mine) continue;
    const key = `pr:${item.repo}#${item.number}`;
    pull?.set(key, {
      tag: key,
      title: 'Novo PR',
      body: `${item.repo}#${item.number} — ${item.title}`,
      url: item.url,
    });
  }

  const review =
    state.reviewRequests.data === null ? null : new Map<string, DesktopAlert>();
  for (const item of state.reviewRequests.data?.items ?? []) {
    const key = `review:${item.repo}#${item.number}`;
    review?.set(key, {
      tag: key,
      title: 'Revisão pedida',
      body: `${item.repo}#${item.number} — ${item.title}`,
      url: item.url,
    });
  }

  const agenda = state.agenda.data === null ? null : new Map<string, DesktopAlert>();
  for (const item of state.agenda.data ?? []) {
    const key = agendaKey('agenda', item);
    agenda?.set(key, {
      tag: key,
      title: 'Novo evento na agenda',
      body: agendaBody(item),
      url: '',
    });
  }

  const slack = state.slack.data === null ? null : new Map<string, DesktopAlert>();
  for (const item of state.slack.data?.mentions ?? []) {
    const key = `slack:${item.id}`;
    slack?.set(key, {
      tag: key,
      title: 'Menção no Slack',
      body: `${item.author} — ${item.text}`,
      url: item.url,
    });
  }
  for (const item of state.slack.data?.directs ?? []) {
    const key = `slack:${item.id}`;
    slack?.set(key, {
      tag: key,
      title: 'Mensagem no Slack',
      body: `${item.author} — ${item.text}`,
      url: item.url,
    });
  }

  return { email, jira, jiraProblem, pull, review, agenda, slack };
}

export function diffAlerts(
  seen: SeenState,
  current: ReturnType<typeof currentAlerts>,
): { alerts: DesktopAlert[]; seen: SeenState } {
  const alerts: DesktopAlert[] = [];
  const sources = { ...seen.sources };

  for (const source of SOURCES) {
    const items = current[source];
    if (items === null) continue;
    const keys = [...items.keys()];
    const previous = seen.sources[source];
    if (previous !== undefined) {
      const known = new Set(previous);
      for (const [key, alert] of items) {
        if (!known.has(key)) alerts.push(alert);
      }
    }
    sources[source] = keys;
  }

  return { alerts, seen: { v: 1, sources, reminders: [...seen.reminders] } };
}

export function dueReminders(
  agenda: AgendaItem[],
  now: Date,
  seen: SeenState,
  leadMinutes = 10,
): { alerts: DesktopAlert[]; seen: SeenState } {
  const alerts: DesktopAlert[] = [];
  const known = new Set(seen.reminders);
  const retained = new Set<string>();
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;

  for (const item of agenda) {
    if (!item.time) continue;
    // O servidor e o navegador usam o mesmo fuso; sem sufixo, Date interpreta
    // a data e a hora locais que o painel recebeu.
    const start = new Date(`${item.date}T${item.time}:00`);
    const key = agendaKey('reminder', item);
    if (start.getTime() >= cutoff && known.has(key)) retained.add(key);

    const remaining = start.getTime() - now.getTime();
    if (remaining <= 0 || remaining > leadMinutes * 60 * 1000 || known.has(key)) continue;
    retained.add(key);
    alerts.push({
      tag: key,
      title: `Em ${Math.ceil(remaining / 60_000)} min`,
      body: `${item.time} — ${item.title}`,
      url: '',
    });
  }

  return {
    alerts,
    seen: { ...seen, reminders: [...retained] },
  };
}

export function summarize(alerts: DesktopAlert[], max = 5): DesktopAlert[] {
  if (alerts.length <= max) return alerts;
  return [
    {
      tag: 'resumo',
      title: 'daily-web',
      body: `${alerts.length} novidades no painel`,
      url: '',
    },
  ];
}
