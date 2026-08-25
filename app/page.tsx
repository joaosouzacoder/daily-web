'use client';

import { useDashboardState } from '@/lib/hooks/usePolling';
import { NowBand } from '@/components/NowBand';
import { NotificationsBell } from '@/components/NotificationsBell';
import { EmailPanel } from '@/components/EmailPanel';
import { AgendaPanel } from '@/components/AgendaPanel';
import { PullsPanel } from '@/components/PullsPanel';
import { JiraPanel } from '@/components/JiraPanel';
import { TasksPanel } from '@/components/TasksPanel';

export default function DashboardPage() {
  const { state, loading, refreshNow, reload } = useDashboardState();
  const booting = loading && !state;

  return (
    <main className="shell">
      <NowBand
        pomodoro={state?.pomodoro ?? null}
        loading={loading}
        onRefresh={() => void refreshNow()}
        onChanged={reload}
        updatedAt={state?.updatedAt ?? null}
        bell={
          <NotificationsBell
            notifications={state?.notifications ?? { data: [], error: null }}
            onChanged={reload}
          />
        }
      />

      <div className="columns">
        <div className="col">
          <EmailPanel
            email={state?.email ?? { data: [], error: null }}
            onChanged={reload}
            loading={booting}
          />
          <TasksPanel
            tasks={state?.tasks ?? { data: [], error: null }}
            onChanged={reload}
            loading={booting}
          />
        </div>
        <div className="col">
          <AgendaPanel agenda={state?.agenda ?? { data: [], error: null }} loading={booting} />
          <JiraPanel jira={state?.jira ?? { data: [], error: null }} loading={booting} />
          <PullsPanel
            pulls={state?.pulls ?? { data: { lines: [] }, error: null }}
            onChanged={reload}
            loading={booting}
          />
        </div>
      </div>
    </main>
  );
}
