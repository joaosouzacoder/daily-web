'use client';

import Link from 'next/link';
import { useDashboardState } from '@/lib/hooks/usePolling';
import { NowBand } from '@/components/NowBand';
import { NotificationsBell } from '@/components/NotificationsBell';
import { EmailPanel } from '@/components/EmailPanel';
import { AgendaPanel } from '@/components/AgendaPanel';
import { PullsPanel } from '@/components/PullsPanel';
import { JiraPanel } from '@/components/JiraPanel';
import { TasksPanel } from '@/components/TasksPanel';
import { EmptyState } from '@/components/ui/EmptyState';

export default function DashboardPage() {
  const { state, loading, refreshNow, reload } = useDashboardState();
  const booting = loading && !state;

  // Cada pessoa liga os módulos que usa. Um painel de módulo desligado não
  // aparece vazio: ele não aparece.
  const modules = state?.modules ?? [];
  const has = (id: string) => modules.includes(id);
  const nothingOn = state !== null && modules.length === 0;

  const left = [
    has('email') && (
      <EmailPanel
        key="email"
        email={state?.email ?? { data: [], error: null }}
        mailboxes={state?.mailboxes ?? []}
        onChanged={reload}
        loading={booting}
      />
    ),
    has('tasks') && (
      <TasksPanel
        key="tasks"
        tasks={state?.tasks ?? { data: [], error: null }}
        onChanged={reload}
        loading={booting}
      />
    ),
  ].filter(Boolean);

  const right = [
    has('agenda') && (
      <AgendaPanel key="agenda" agenda={state?.agenda ?? { data: [], error: null }} loading={booting} />
    ),
    has('jira') && (
      <JiraPanel key="jira" jira={state?.jira ?? { data: [], error: null }} loading={booting} />
    ),
    has('pulls') && (
      <PullsPanel
        key="pulls"
        pulls={state?.pulls ?? { data: { items: [], errors: [] }, error: null }}
        onChanged={reload}
        loading={booting}
      />
    ),
  ].filter(Boolean);

  return (
    <main className="shell">
      <NowBand
        pomodoro={state?.pomodoro ?? null}
        loading={loading}
        onRefresh={() => void refreshNow()}
        onChanged={reload}
        updatedAt={state?.updatedAt ?? null}
        bell={
          has('jira') ? (
            <NotificationsBell
              notifications={state?.notifications ?? { data: [], error: null }}
              onChanged={reload}
            />
          ) : null
        }
      />

      {nothingOn ? (
        <div className="welcome">
          <EmptyState message="Nenhum módulo ligado ainda." />
          <p className="welcome-text">
            Conecte seu e-mail, agenda, Jira ou GitHub para o painel começar a mostrar alguma coisa.
            Cada um é opcional e leva menos de um minuto.
          </p>
          <Link className="btn btn-primary" href="/config">
            Conectar minhas contas
          </Link>
        </div>
      ) : (
        <div className="columns">
          <div className="col">{left}</div>
          <div className="col">{right}</div>
        </div>
      )}
    </main>
  );
}
