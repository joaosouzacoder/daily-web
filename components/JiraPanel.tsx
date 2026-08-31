'use client';

import { useMemo, useState } from 'react';
import { NavArrowRight } from 'iconoir-react';
import type { JiraItem, PanelResult } from '@/lib/types';
import type { ActiveFilter } from '@/lib/filters';
import { matchesQuery } from '@/lib/filters';
import {
  buildJiraTree,
  dueLabel,
  groupByStatusCategory,
  isOverdue,
  issueMarker,
  normalizeStatus,
  stalenessLabel,
} from '@/lib/parsers/jira';
import type { JiraNode, JiraProjectGroup } from '@/lib/parsers/jira';
import { Section } from './ui/Section';
import { Tabs } from './ui/Tabs';
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

/** As duas listas do painel. Não são recortes da mesma coleção: "Em aberto"
 *  é o que ainda pede trabalho, "Entregues" é o que saiu hoje. */
type Aba = 'abertas' | 'entregues';

interface Props {
  jira: PanelResult<JiraItem[]>;
  /** Issues acompanhadas por escolha, mesmo não sendo suas. */
  watched: PanelResult<JiraItem[]>;
  /** Issues que você encerrou hoje. */
  delivered: PanelResult<JiraItem[]>;
  onChanged: () => void;
  loading?: boolean;
}

export function JiraPanel({ jira, watched, delivered, onChanged, loading = false }: Props) {
  const [aba, setAba] = useState<Aba>('abertas');
  const [novaChave, setNovaChave] = useState('');
  const [watchError, setWatchError] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState<Set<string>>(new Set());
  // Ramos abertos da hierarquia, pela chave da issue. Começam fechados, como
  // as subtarefas: a lista abre mostrando o topo, e você desce onde quer.
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const alternarRamo = (chave: string) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  };

  // O servidor é a verdade; `removendo` só antecipa a saída da lista até a
  // próxima resposta chegar sem a chave.
  const acompanhadas = useMemo(
    () => (watched.data ?? []).filter((i) => !removendo.has(i.key)),
    [watched.data, removendo],
  );

  const acompanhar = async () => {
    const chave = novaChave.trim().toUpperCase();
    if (!chave || salvando) return;
    setSalvando(true);
    const res = await fetch('/api/jira/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: chave }),
    });
    setSalvando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setWatchError(data.error ?? 'Falha ao acompanhar');
      return;
    }
    setWatchError(null);
    setNovaChave('');
    onChanged();
  };

  const parar = async (chave: string) => {
    // Sai da lista na hora. Esperar o `onChanged` significaria esperar o Jira
    // responder de novo — segundos para uma decisão que é toda local.
    setRemovendo((prev) => new Set(prev).add(chave));
    const res = await fetch('/api/jira/watch', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: chave }),
    });
    if (!res.ok) {
      setRemovendo((prev) => {
        const next = new Set(prev);
        next.delete(chave);
        return next;
      });
      setWatchError('Falha ao remover do acompanhamento');
      return;
    }
    setWatchError(null);
    onChanged();
  };

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
  const situations = useMemo(() => groupByStatusCategory(visible), [visible]);

  // Entregues repete a estrutura de "Em aberto": hierarquia, separada por
  // projeto, para DAD e PDS não se misturarem só porque saíram no mesmo dia.
  const entregues = useMemo(() => delivered.data ?? [], [delivered.data]);
  const entreguesProjects = useMemo(() => buildJiraTree(entregues), [entregues]);

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
      count={
        aba === 'abertas' && activeFilters.length > 0
          ? `${visible.length} de ${all.length}`
          : undefined
      }
    >
      <Tabs
        id="jira"
        label="listas do Jira"
        active={aba}
        onChange={(id) => setAba(id as Aba)}
        tabs={[
          { id: 'abertas', label: 'Em aberto', count: all.length },
          { id: 'entregues', label: 'Entregues', count: entregues.length },
        ]}
      />

      {aba === 'entregues' && (
        <div id="jira-panel-entregues" role="tabpanel" aria-labelledby="jira-tab-entregues">
          {delivered.error && (
            <p role="alert" className="panel-error">
              {delivered.error}
            </p>
          )}

          {loading && entregues.length === 0 && <SkeletonRows count={3} />}

          {!loading && entregues.length === 0 && !delivered.error && (
            <EmptyState message="Nenhuma issue entregue hoje." />
          )}

          <JiraProjects
            groups={entreguesProjects}
            expandidos={expandidos}
            onAlternar={alternarRamo}
          />
        </div>
      )}

      {aba === 'abertas' && (
        <div id="jira-panel-abertas" role="tabpanel" aria-labelledby="jira-tab-abertas">
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

          {/* Acompanhar uma issue que não é sua: o Jira do time vizinho que trava
              o seu, ou o que você abriu para outra pessoa. */}
          <div className="jira-watch">
            <h3 className="jira-group-label eyebrow">
              Acompanhando
              {acompanhadas.length > 0 && (
                <span className="section-count mono"> {acompanhadas.length}</span>
              )}
            </h3>

            <div className="jira-watch-add">
              <input
                className="field"
                aria-label="acompanhar issue do Jira"
                placeholder="ABC-123"
                value={novaChave}
                onChange={(e) => setNovaChave(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void acompanhar();
                }}
              />
              <button
                type="button"
                className="btn"
                disabled={salvando || novaChave.trim().length === 0}
                onClick={() => void acompanhar()}
              >
                {salvando ? 'Buscando…' : 'Acompanhar'}
              </button>
            </div>

            {watchError && (
              <p role="alert" className="panel-error">
                {watchError}
              </p>
            )}
            {watched.error && (
              <p role="alert" className="panel-error">
                {watched.error}
              </p>
            )}

            {acompanhadas.length === 0 && !watchError && (
              <p className="empty">Nenhuma issue acompanhada.</p>
            )}

            <ul>
              {acompanhadas.map((issue) => (
                <li key={issue.key} className="jira-row">
                  <span className="jira-kind mono">{issueMarker(issue)}</span>
                  <div className="jira-main">
                    <div className="jira-line">
                      <a className="jira-key mono" href={issue.url} target="_blank" rel="noreferrer">
                        {issue.key}
                      </a>
                      <span className="jira-summary">{issue.summary}</span>
                    </div>
                    <div className="jira-meta">
                      <span className={`jira-status jira-status-${issue.statusCategory}`}>
                        {normalizeStatus(issue.status)}
                      </span>
                      {stalenessLabel(issue) && (
                        <span className="jira-stale">{stalenessLabel(issue)}</span>
                      )}
                      {issue.dueDate && dueLabel(issue.dueDate) && (
                        <span className={isOverdue(issue.dueDate) ? 'jira-due is-overdue' : 'jira-due'}>
                          {dueLabel(issue.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    aria-label={`parar de acompanhar ${issue.key}`}
                    onClick={() => void parar(issue.key)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>

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

          {grouped &&
            visible.length > 0 &&
            situations.map((group) => (
              <div key={group.category} className="jira-project">
                <h3 className="jira-group-label eyebrow">
                  {group.label}
                  <span className="section-count mono"> {group.issues.length}</span>
                </h3>
                <ul>
                  {group.issues.map((issue) => (
                    <JiraRow key={issue.key} issue={issue} showRole={filter === 'both'} depth={0} />
                  ))}
                </ul>
              </div>
            ))}

          {!grouped && visible.length > 0 && (
            <JiraProjects
              groups={projects}
              showRole={filter === 'both'}
              expandidos={expandidos}
              onAlternar={alternarRamo}
            />
          )}
        </div>
      )}
    </Section>
  );
}

/** A hierarquia por projeto: um bloco por projeto, e dentro dele a árvore de
 *  pais e filhas. É o que as duas abas têm em comum. */
function JiraProjects({
  groups,
  showRole = false,
  expandidos,
  onAlternar,
}: {
  groups: JiraProjectGroup[];
  showRole?: boolean;
  expandidos: Set<string>;
  onAlternar: (chave: string) => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.project} className="jira-project">
          <h3 className="jira-group-label eyebrow">
            {group.project}
            <span className="section-count mono"> {group.count}</span>
          </h3>
          <ul>
            {group.roots.map((node) => (
              <JiraBranch
                key={node.issue.key}
                node={node}
                showRole={showRole}
                depth={0}
                expandidos={expandidos}
                onAlternar={onAlternar}
              />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function JiraBranch({
  node,
  showRole,
  depth,
  expandidos,
  onAlternar,
}: {
  node: JiraNode;
  showRole: boolean;
  depth: number;
  expandidos: Set<string>;
  onAlternar: (chave: string) => void;
}) {
  const temFilhos = node.children.length > 0;
  const aberto = expandidos.has(node.issue.key);

  return (
    <>
      <JiraRow
        issue={node.issue}
        showRole={showRole}
        depth={depth}
        filhos={node.children.length}
        aberto={aberto}
        onAlternar={() => onAlternar(node.issue.key)}
      />
      {temFilhos &&
        aberto &&
        node.children.map((child) => (
          <JiraBranch
            key={child.issue.key}
            node={child}
            showRole={showRole}
            depth={depth + 1}
            expandidos={expandidos}
            onAlternar={onAlternar}
          />
        ))}
    </>
  );
}

function JiraRow({
  issue,
  showRole,
  depth,
  filhos = 0,
  aberto = false,
  onAlternar,
}: {
  issue: JiraItem;
  showRole: boolean;
  depth: number;
  /** Quantas issues estão logo abaixo desta. Zero fora da hierarquia. */
  filhos?: number;
  aberto?: boolean;
  onAlternar?: () => void;
}) {
  const parado = stalenessLabel(issue);
  const prazo = issue.dueDate ? dueLabel(issue.dueDate) : null;
  const atrasado = issue.dueDate ? isOverdue(issue.dueDate) : false;
  // O papel só é dito quando não é o padrão: em 15 de 19 issues ele era
  // "responsável", e um selo que repete não informa nada. Relator, sim, é
  // exceção e vale a marca.
  const eRelator = issue.role === 'reporter';

  return (
    <li
      className="jira-row"
      style={{ paddingLeft: depth > 0 ? `calc(${depth} * var(--s4))` : undefined }}
    >
      {depth > 0 && <span className="jira-branch" aria-hidden="true" />}
      {/* A seta só existe onde há o que revelar. Numa issue sem filha ela
          seria um controle que não faz nada — o espaçador mantém o
          alinhamento da coluna. */}
      {filhos > 0 && onAlternar ? (
        <button
          type="button"
          className="subtask-caret"
          aria-label={`${aberto ? 'recolher' : 'expandir'} ${filhos === 1 ? 'a issue' : `as ${filhos} issues`} sob ${issue.key}`}
          aria-expanded={aberto}
          onClick={onAlternar}
        >
          <NavArrowRight width={14} height={14} />
        </button>
      ) : (
        <span className="subtask-caret is-empty" aria-hidden="true" />
      )}
      <span className="jira-kind mono">{issueMarker(issue)}</span>
      <div className="jira-main">
        <div className="jira-line">
          <a className="jira-key mono" href={issue.url} target="_blank" rel="noreferrer">
            {issue.key}
          </a>
          <span className="jira-summary">{issue.summary}</span>
          {showRole && eRelator && <span className="jira-role jira-role-rel">REL</span>}
        </div>
        <div className="jira-meta">
          <span className={`jira-status jira-status-${issue.statusCategory}`}>
            {normalizeStatus(issue.status)}
          </span>
          {parado && <span className="jira-stale">{parado}</span>}
          {prazo && <span className={atrasado ? 'jira-due is-overdue' : 'jira-due'}>{prazo}</span>}
        </div>
      </div>
    </li>
  );
}
