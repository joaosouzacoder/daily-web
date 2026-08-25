'use client';

import { useDashboardState } from '@/lib/hooks/usePolling';
import { Clock } from '@/components/Clock';
import { Pomodoro } from '@/components/Pomodoro';
import { EmailPanel } from '@/components/EmailPanel';
import { AgendaPanel } from '@/components/AgendaPanel';
import { PullsPanel } from '@/components/PullsPanel';
import { JiraPanel } from '@/components/JiraPanel';
import { TasksPanel } from '@/components/TasksPanel';
import { NotificationsBell } from '@/components/NotificationsBell';

export default function DashboardPage() {
  const { state, loading, refreshNow, reload } = useDashboardState();

  return (
    <main>
      <div className="topbar">
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <Clock />
          <Pomodoro pomodoro={state?.pomodoro ?? null} onChanged={reload} />
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button onClick={() => void refreshNow()} disabled={loading}>
            {loading ? 'atualizando…' : 'atualizar agora'}
          </button>
          <NotificationsBell
            notifications={state?.notifications ?? { data: [], error: null }}
            onChanged={reload}
          />
        </div>
      </div>
      <div className="dashboard-grid">
        <EmailPanel email={state?.email ?? { data: [], error: null }} onChanged={reload} />
        <AgendaPanel agenda={state?.agenda ?? { data: [], error: null }} />
        <JiraPanel jira={state?.jira ?? { data: [], error: null }} />
        <TasksPanel tasks={state?.tasks ?? { data: [], error: null }} onChanged={reload} />
        <PullsPanel pulls={state?.pulls ?? { data: { lines: [] }, error: null }} className="span-2" />
      </div>
    </main>
  );
}
