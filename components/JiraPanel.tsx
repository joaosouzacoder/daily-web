'use client';

import { useMemo, useState } from 'react';
import type { JiraItem, PanelResult } from '@/lib/types';
import type { ActiveFilter } from '@/lib/filters';
import { matchesQuery } from '@/lib/filters';
import { buildJiraTree, issueMarker } from '@/lib/parsers/jira';
import type { JiraNode } from '@/lib/parsers/jira';
import { Section } from './ui/Section';
import { FilterBar } from './ui/FilterBar';
import { SearchInput } from './ui/SearchInput';
import { Chip } from './ui/Chip';
import { ActiveFilters } from './ui/ActiveFilters';
import { EmptyState } from './ui/EmptyState';
import { SkeletonRows } from './ui/Skeleton';

type Filter = 'both' | 'assignee' | 'reporter';

const FILTER_LABEL: Record<Filter, string> = {
  both: 'Ambas',
  assignee: 'Minhas',
  reporter: 'Relator',
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

  const projects = useMemo(() => buildJiraTree(visible), [visible]);

  const activeFilters: ActiveFilter[] = [
    ...(query.trim() ? [{ id: 'query', label: `Busca: ${query.trim()}` }] : []),
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
        <Chip active={!grouped} onClick={() => setGrouped((g) => !g)}>
          {grouped ? 'Lista simples' : 'Hierarquia'}
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

      {grouped && visible.length > 0 && (
        <ul>
          {visible.map((issue) => (
            <JiraRow key={issue.key} issue={issue} showRole={filter === 'both'} depth={0} />
          ))}
        </ul>
      )}

      {!grouped &&
        visible.length > 0 &&
        projects.map((group) => (
          <div key={group.project} className="jira-project">
            <h3 className="jira-group-label eyebrow">
              {group.project}
              <span className="section-count mono"> {group.count}</span>
            </h3>
            <ul>
              {group.roots.map((node) => (
                <JiraBranch key={node.issue.key} node={node} showRole={filter === 'both'} depth={0} />
              ))}
            </ul>
          </div>
        ))}
    </Section>
  );
}

function JiraBranch({
  node,
  showRole,
  depth,
}: {
  node: JiraNode;
  showRole: boolean;
  depth: number;
}) {
  return (
    <>
      <JiraRow issue={node.issue} showRole={showRole} depth={depth} />
      {node.children.map((child) => (
        <JiraBranch key={child.issue.key} node={child} showRole={showRole} depth={depth + 1} />
      ))}
    </>
  );
}

function JiraRow({
  issue,
  showRole,
  depth,
}: {
  issue: JiraItem;
  showRole: boolean;
  depth: number;
}) {
  const isReporter = issue.role === 'reporter';
  return (
    <li className="jira-row" style={{ paddingLeft: depth > 0 ? `calc(${depth} * var(--s4))` : undefined }}>
      {depth > 0 && <span className="jira-branch" aria-hidden="true" />}
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
