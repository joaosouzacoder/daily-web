'use client';

import { useMemo, useState } from 'react';
import type { JiraItem, PanelResult } from '@/lib/types';
import { groupByParent, issueMarker } from '@/lib/parsers/jira';

type Filter = 'both' | 'assignee' | 'reporter';
const FILTER_CYCLE: Filter[] = ['both', 'assignee', 'reporter'];
const FILTER_LABEL: Record<Filter, string> = { both: 'ambas', assignee: 'minhas', reporter: 'relator' };

function roleBadge(role: JiraItem['role']): { label: string; color: string } {
  if (role === 'reporter') return { label: 'REL', color: 'var(--ctp-green)' };
  return { label: 'RES', color: '#FF991F' };
}

export function JiraPanel({ jira }: { jira: PanelResult<JiraItem[]> }) {
  const [filter, setFilter] = useState<Filter>('both');
  const [grouped, setGrouped] = useState(false);

  const filtered = (jira.data ?? []).filter(
    (i) => filter === 'both' || i.role === filter || i.role === 'both',
  );
  const groups = useMemo(() => groupByParent(filtered), [filtered]);

  const cycleFilter = () =>
    setFilter((f) => FILTER_CYCLE[(FILTER_CYCLE.indexOf(f) + 1) % FILTER_CYCLE.length]);

  return (
    <section className="card" data-testid="jira-panel">
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>Jira</h2>
        <div>
          <button onClick={cycleFilter}>filtro: {FILTER_LABEL[filter]}</button>
          <button onClick={() => setGrouped((g) => !g)}>{grouped ? 'lista' : 'agrupar por pai'}</button>
        </div>
      </header>
      {jira.error && <p role="alert">{jira.error}</p>}
      {!grouped && (
        <ul>
          {filtered.map((issue) => (
            <JiraRow key={issue.key} issue={issue} showRole={filter === 'both'} />
          ))}
        </ul>
      )}
      {grouped &&
        groups.map((group) => (
          <div key={group.parentKey ?? 'sem-pai'}>
            <strong>{group.parentSummary}</strong>
            <ul>
              {group.issues.map((issue) => (
                <JiraRow key={issue.key} issue={issue} showRole={filter === 'both'} />
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}

function JiraRow({ issue, showRole }: { issue: JiraItem; showRole: boolean }) {
  const badge = showRole ? roleBadge(issue.role) : null;
  return (
    <li>
      {badge && <span style={{ color: badge.color }}>{badge.label}</span>}{' '}
      <span>{issueMarker(issue)}</span>{' '}
      <a href={issue.url} target="_blank" rel="noreferrer">
        {issue.key}
      </a>{' '}
      — {issue.summary}
    </li>
  );
}
