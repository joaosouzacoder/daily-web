'use client';

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useDashboardState } from '@/lib/hooks/usePolling';
import { NowBand } from '@/components/NowBand';
import { NotificationsBell } from '@/components/NotificationsBell';
import { EmailPanel } from '@/components/EmailPanel';
import { AgendaPanel } from '@/components/AgendaPanel';
import { PullsPanel } from '@/components/PullsPanel';
import { JiraPanel } from '@/components/JiraPanel';
import { TasksPanel } from '@/components/TasksPanel';
import { DashboardGrid } from '@/components/DashboardGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { DEFAULT_AGENDA_DAYS } from '@/lib/agendaWindow';
import { defaultLayout, isDefaultLayout, type PanelPlacement } from '@/lib/dashboardLayout';
import {
  markEmailsSeen,
  markNotificationRead,
  removeEmails,
  removeTask,
  setSubtaskCompleted,
  setTaskCompleted,
} from '@/lib/statePatches';

export default function DashboardPage() {
  const { state, loading, refreshNow, reload, mutate } = useDashboardState();
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const booting = loading && !state;

  // Cada pessoa liga os módulos que usa. Um painel de módulo desligado não
  // aparece vazio: ele não aparece.
  const modules = state?.modules ?? [];
  const has = (id: string) => modules.includes(id);
  const nothingOn = state !== null && modules.length === 0;
  const layout = (state?.layout as PanelPlacement[] | undefined) ?? defaultLayout();

  // A grade reposiciona o que já está na tela, sem buscar nada de fora — por
  // isso a mudança é aplicada na hora e gravada em segundo plano.
  const saveLayout = useCallback(
    async (next: PanelPlacement[]) => {
      mutate((s) => ({ ...s, layout: next }));
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLayoutError(data.error ?? 'Falha ao guardar a disposição dos painéis');
        reload();
        return;
      }
      setLayoutError(null);
    },
    [mutate, reload],
  );

  const restoreLayout = useCallback(async () => {
    const res = await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: null }),
    });
    if (!res.ok) {
      setLayoutError('Falha ao restaurar a disposição');
      return;
    }
    setLayoutError(null);
    mutate((s) => ({ ...s, layout: defaultLayout() }));
  }, [mutate]);

  const panels: { id: string; node: ReactNode }[] = [
    has('email') && {
      id: 'email',
      node: (
        <EmailPanel
          email={state?.email ?? { data: [], error: null }}
          mailboxes={state?.mailboxes ?? []}
          onChanged={reload}
          onSeenChanged={(targets, seen) => mutate((s) => markEmailsSeen(s, targets, seen))}
          onRemoved={(targets) => mutate((s) => removeEmails(s, targets))}
          loading={booting}
        />
      ),
    },
    has('tasks') && {
      id: 'tasks',
      node: (
        <TasksPanel
          tasks={state?.tasks ?? { data: [], error: null }}
          onChanged={reload}
          onCompletedChanged={(id, completed) => mutate((s) => setTaskCompleted(s, id, completed))}
          onRemoved={(id) => mutate((s) => removeTask(s, id))}
          onSubtaskChanged={(taskId, itemId, completed) =>
            mutate((s) => setSubtaskCompleted(s, taskId, itemId, completed))
          }
          loading={booting}
        />
      ),
    },
    has('agenda') && {
      id: 'agenda',
      node: (
        <AgendaPanel
          agenda={state?.agenda ?? { data: [], error: null }}
          days={state?.agendaDays ?? DEFAULT_AGENDA_DAYS}
          onChanged={reload}
          loading={booting}
        />
      ),
    },
    has('jira') && {
      id: 'jira',
      node: <JiraPanel jira={state?.jira ?? { data: [], error: null }} loading={booting} />,
    },
    has('pulls') && {
      id: 'pulls',
      node: (
        <PullsPanel
          pulls={state?.pulls ?? { data: { items: [], errors: [] }, error: null }}
          onChanged={reload}
          loading={booting}
        />
      ),
    },
  ].filter((p) => p !== false) as { id: string; node: ReactNode }[];

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
              onMarkedRead={(id) => mutate((s) => markNotificationRead(s, id))}
            />
          ) : null
        }
        extra={
          !isDefaultLayout(layout) ? (
            <button type="button" className="btn" onClick={() => void restoreLayout()}>
              Restaurar disposição
            </button>
          ) : null
        }
      />

      {layoutError && (
        <p role="alert" className="panel-error">
          {layoutError}
        </p>
      )}

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
        <DashboardGrid layout={layout} panels={panels} onLayoutChange={saveLayout} />
      )}
    </main>
  );
}
