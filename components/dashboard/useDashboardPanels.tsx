'use client';

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSharedDashboardState } from '@/lib/hooks/DashboardStateProvider';
import { EmailPanel } from '@/components/EmailPanel';
import { AgendaPanel } from '@/components/AgendaPanel';
import { PullsPanel } from '@/components/PullsPanel';
import { JiraPanel } from '@/components/JiraPanel';
import { TasksPanel } from '@/components/TasksPanel';
import { NotesPanel } from '@/components/NotesPanel';
import { SlackPanel } from '@/components/SlackPanel';
import { DEFAULT_AGENDA_DAYS } from '@/lib/agendaWindow';
import {
  markEmailsSeen,
  removeEmails,
  removeTask,
  setSubtaskCompleted,
  setTaskCompleted,
  setTaskDoing,
  setTaskStyle,
} from '@/lib/statePatches';

export interface DashboardPanel {
  id: string;
  node: ReactNode;
}

/**
 * The panels of the modules the person turned on, wired to the shared
 * dashboard state. The home grid and the Teste Home workspace draw the same
 * panels and differ only in how they arrange them.
 */
export function useDashboardPanels() {
  const dashboard = useSharedDashboardState();
  const { state, loading, reload, mutate } = dashboard;
  const booting = loading && !state;
  // As duas listas de PRs, para o Jira mostrar sob cada issue o PR que a cita.
  const jiraPulls = useMemo(
    () => [...(state?.pulls.data?.items ?? []), ...(state?.reviewRequests.data?.items ?? [])],
    [state?.pulls.data, state?.reviewRequests.data],
  );

  // Cada pessoa liga os módulos que usa. Um painel de módulo desligado não
  // aparece vazio: ele não aparece.
  const modules = state?.modules ?? [];
  const has = (id: string) => modules.includes(id);
  const nothingOn = state !== null && modules.length === 0;

  const panels: DashboardPanel[] = [
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
          onDoingChanged={(id, doing) => mutate((s) => setTaskDoing(s, id, doing))}
          onStyleChanged={(id, style) => mutate((s) => setTaskStyle(s, id, style))}
          view={state?.tasksView ?? 'board'}
          onViewChanged={(tasksView) => mutate((s) => ({ ...s, tasksView }))}
          loading={booting}
        />
      ),
    },
    has('notes') && {
      id: 'notes',
      // O painel busca e grava as próprias notas: passar por `state` faria o
      // refresh de 60s sobrescrever o que está sendo digitado.
      node: <NotesPanel />,
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
      node: (
        <JiraPanel
          jira={state?.jira ?? { data: [], error: null }}
          watched={state?.jiraWatched ?? { data: [], error: null }}
          delivered={state?.jiraDelivered ?? { data: [], error: null }}
          approved={state?.jiraApproved ?? { data: [], error: null }}
          problems={state?.jiraProblems ?? { data: [], error: null }}
          ancestors={state?.jiraAncestors ?? []}
          people={state?.jiraFollowedPeople ?? []}
          refreshedAt={state?.updatedAt ?? null}
          onChanged={reload}
          loading={booting}
          pulls={jiraPulls}
          myPulls={state?.myPulls.data?.items}
        />
      ),
    },
    has('pulls') && {
      id: 'pulls',
      node: (
        <PullsPanel
          pulls={state?.pulls ?? { data: { items: [], errors: [], defaultBranches: [], truncated: [] }, error: null }}
          reviewRequests={state?.reviewRequests ?? { data: null, error: null }}
          myPulls={state?.myPulls ?? { data: null, error: null }}
          onChanged={reload}
          loading={booting}
        />
      ),
    },
    has('slack') && {
      id: 'slack',
      node: (
        <SlackPanel
          slack={state?.slack ?? { data: { mentions: [], directs: [], team: '' }, error: null }}
          loading={booting}
        />
      ),
    },
  ].filter((p) => p !== false) as DashboardPanel[];

  return { ...dashboard, booting, nothingOn, panels };
}
