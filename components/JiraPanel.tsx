'use client';

import { useMemo, useState } from 'react';
import type { JiraItem, PanelResult } from '@/lib/types';
import type { ActiveFilter } from '@/lib/filters';
import { matchesQuery } from '@/lib/filters';
import { groupByParent, issueMarker } from '@/lib/parsers/jira';
import { Section } from './ui/Section';
import { FilterBar } from './ui/FilterBar';
import { SearchInput } from './ui/SearchInput';
import { Chip } from './ui/Chip';
import { ActiveFilters } from './ui/ActiveFilters';
import { EmptyState } from './ui/EmptyState';
import { SkeletonRows } from './ui/Skeleton';

type Filter = 'both' | 'assignee' | 'reporter';

const FILTER_LABEL: Record<Filter, string> = {
  both: 'ambas',
  assignee: 'minhas',
  reporter: 'relator',
};

interface Props {
  jira: PanelResult<JiraItem[]>;
  loading?: boolean;
}

export function JiraPanel({ jira, loading = false }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('both');
  const [grouped, setGrouped] = useState(false);

  const all = useMemo(() => jira.data ?? [], [jira.data]);

  // Uma issue com papel 'both' é genuinamente das duas naturezas: aparece
  // tanto em "minhas" quanto em "relator".
  const visible = useMemo(
    () =>
      all.filter(
        (i) =>
          matchesQuery([i.key, i.summary], query) &&
          (filter === 'both' || i.role === filter || i.role === 'both'),
      ),
    [all, query, filter],
  );

  const groups = useMemo(() => groupByParent(visible), [visible]);

  const activeFilters: ActiveFilter[] = [
    ...(query.trim() ? [{ id: 'query', label: `busca: ${query.trim()}` }] : []),
    ...(filter !== 'both' ? [{ id: 'role', label: FILTER_LABEL[filter] }] : []),
  ];

  const clearFilter = (id: string) => {
    if (id === 'query') setQuery('');
    if (id === 'role') setFilter('both');
  };

  const clearAll = () => {
    setQuery('');
    setFilter('both');
  };

  return (
    <Section
      eyebrow="Jira"
      count={activeFilters.length > 0 ? `${visible.length} de ${all.length}` : undefined}
    >
      <FilterBar label="Filtrar issues">
        <SearchInput value={query} onChange={setQuery} label="buscar issues" placeholder="chave ou resumo" />
        {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {FILTER_LABEL[f]}
          </Chip>
        ))}
        <Chip active={grouped} onClick={() => setGrouped((g) => !g)}>
          agrupar por pai
        </Chip>
      </FilterBar>

      <ActiveFilters filters={activeFilters} onRemove={clearFilter} onClearAll={clearAll} />

      {jira.error && (
        <p role="alert" className="panel-error">
          {jira.error}
        </p>
      )}

      {loading && all.length === 0 && <SkeletonRows count={5} />}

      {!loading && all.length === 0 && !jira.error && <EmptyState message="Nenhuma issue atribuída." />}

      {all.length > 0 && visible.length === 0 && (
        <EmptyState message="Nenhuma issue com esses filtros." />
      )}

      {!grouped && visible.length > 0 && (
        <ul>
          {visible.map((issue) => (
            <JiraRow key={issue.key} issue={issue} showRole={filter === 'both'} />
          ))}
        </ul>
      )}

      {grouped &&
        visible.length > 0 &&
        groups.map((group) => (
          <div key={group.parentKey ?? 'sem-pai'}>
            <h3 className="jira-group-label eyebrow">{group.parentSummary}</h3>
            <ul>
              {group.issues.map((issue) => (
                <JiraRow key={issue.key} issue={issue} showRole={filter === 'both'} />
              ))}
            </ul>
          </div>
        ))}
    </Section>
  );
}

function JiraRow({ issue, showRole }: { issue: JiraItem; showRole: boolean }) {
  const isReporter = issue.role === 'reporter';
  return (
    <li className="jira-row">
      <span className="jira-kind mono">{issueMarker(issue)}</span>
      <a className="jira-key mono" href={issue.url} target="_blank" rel="noreferrer">
        {issue.key}
      </a>
      <span className="jira-summary">{issue.summary}</span>
      {showRole && (
        <span className={`jira-role ${isReporter ? 'jira-role-rel' : 'jira-role-res'}`}>
          {isReporter ? 'REL' : 'RES'}
        </span>
      )}
    </li>
  );
}
