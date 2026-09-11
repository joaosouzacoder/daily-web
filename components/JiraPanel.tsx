'use client';

import { useCallback, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { IconAction } from '@/components/data/IconAction';
import { NavArrowRight } from 'iconoir-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  JiraDatedItem,
  JiraItem,
  JiraProblemItem,
  JiraStatusCategory,
  PanelResult,
} from '@/lib/types';
import { PanelError } from '@/components/data/PanelError';
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
import { PROBLEM_LABEL } from '@/lib/parsers/jiraProblems';
import { Section } from './ui/Section';
import { Tabs } from './ui/legacy-tabs';
import { FilterBar } from './ui/FilterBar';
import { SearchInput } from './ui/SearchInput';
import { Chip } from './ui/Chip';
import { ActiveFilters } from './ui/ActiveFilters';
import { EmptyState } from '@/components/data/EmptyState';
import { SkeletonRows } from './ui/legacy-skeleton';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { GLYPH } from './data/Status';
import { cn } from '@/lib/utils';
import { focusRing, tabular } from '@/lib/theme';

/**
 * A panel that cannot reach its integration is information, not an alarm: the
 * message stays inside a quiet block with a side marker instead of loose red text
 * competing with the sections that did load.
 */

const emptyNote = 'py-8 text-sm text-ink-dim';

/** The group heading above a project or a situation bucket. */
const groupLabel = 'mb-2 block type-caption text-ink-dim';

const rowShell =
  'flex items-start gap-3 border-b border-line-soft py-3 transition-colors duration-100 ease-brand even:bg-muted/25 hover:bg-brand-tint motion-reduce:transition-none';

const caret =
  'inline-flex size-[18px] shrink-0 items-center justify-center rounded-md text-ink-dim transition-transform duration-100 ease-brand hover:bg-muted hover:text-ink aria-expanded:rotate-90 motion-reduce:transition-none';

const roleBadge =
  'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 type-caption';

/**
 * A situation never borrows the accent: it would change hue whenever the accent
 * changes, with nothing about the issue having changed. The glyph carries the
 * state alongside the tone so the reading survives a grayscale print.
 */
const STATUS_TONE: Record<JiraStatusCategory, { glyph: string; tone: string }> = {
  new: { glyph: GLYPH.idle, tone: 'text-ink-dim' },
  indeterminate: { glyph: GLYPH.moving, tone: 'text-info' },
  done: { glyph: GLYPH.live, tone: 'text-success' },
};

/** The legacy `jira-status-<category>` class rides along: it is what the panel's
 *  tests reach for when they check which situation a row is showing. */
function JiraStatus({ issue }: { issue: JiraItem }) {
  const { glyph, tone } = STATUS_TONE[issue.statusCategory];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className={tone}>
        {glyph}
      </span>
      <span className={cn(tone, `jira-status-${issue.statusCategory}`)}>
        {normalizeStatus(issue.status)}
      </span>
    </span>
  );
}

type Filter = 'both' | 'assignee' | 'reporter';

const FILTER_LABEL: Record<Filter, string> = {
  both: 'Ambas',
  assignee: 'Minhas',
  reporter: 'Relator',
};

/** As listas do painel. Não são recortes da mesma coleção: "Em aberto" é
 *  o que ainda pede trabalho, "Entregues" é o que saiu das suas mãos,
 *  "Aprovados" é o que passou por uma decisão sua e "Problemas" é o que está
 *  mal preenchido. */
const ABAS = ['abertas', 'entregues', 'aprovados', 'problemas'] as const;
type Aba = (typeof ABAS)[number];

// A aba vive na URL para sobreviver ao recarregar e ir junto num link. A
// padrão fica fora dela, e o valor que não for uma aba conhecida cai na padrão.
const ABA_PARAM = 'jira';
const ABA_PADRAO: Aba = 'abertas';

function parseAba(value: string | null): Aba {
  return ABAS.find((aba) => aba === value) ?? ABA_PADRAO;
}

/** O recorte de tempo das duas listas fechadas. As issues das duas já chegam
 *  cobrindo a semana, com a marca de quais são de hoje, então trocar aqui não
 *  vai ao servidor. */
type Periodo = 'hoje' | 'semana';

const PERIODO_LABEL: Record<Periodo, string> = {
  hoje: 'Hoje',
  semana: '7 dias',
};

interface Props {
  jira: PanelResult<JiraItem[]>;
  /** Issues acompanhadas por escolha, mesmo não sendo suas. */
  watched: PanelResult<JiraItem[]>;
  /** Issues que você encerrou nos últimos sete dias. */
  delivered: PanelResult<JiraDatedItem[]>;
  /** Issues que você aprovou nos últimos sete dias. */
  approved: PanelResult<JiraDatedItem[]>;
  /** Histórias e épicos seus com defeito de preenchimento. */
  problems: PanelResult<JiraProblemItem[]>;
  onChanged: () => void;
  loading?: boolean;
}

export function JiraPanel({
  jira,
  watched,
  delivered,
  approved,
  problems,
  onChanged,
  loading = false,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const aba = parseAba(searchParams.get(ABA_PARAM));
  // Trocar de aba é navegação: entra no histórico, e o voltar desfaz.
  const setAba = (next: Aba) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === ABA_PADRAO) params.delete(ABA_PARAM);
    else params.set(ABA_PARAM, next);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const [periodo, setPeriodo] = useState<Periodo>('hoje');
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
  // tanto em "minhas" quanto em "relator". O que espera pela sua aprovação
  // atravessa o filtro: aprovar não é um dos papéis, e escondê-la ao recortar
  // por responsável ou relator tiraria da tela justamente o que pede decisão.
  const visible = useMemo(
    () =>
      all.filter(
        (i) =>
          matchesQuery([i.key, i.summary], query) &&
          (filter === 'both' || i.role === filter || i.role === 'both' || i.awaitingApproval),
      ),
    [all, query, filter],
  );

  const projects = useMemo(() => buildJiraTree(visible), [visible]);
  const situations = useMemo(() => groupByStatusCategory(visible), [visible]);

  // Entregues e Aprovados repetem a estrutura de "Em aberto": hierarquia,
  // separada por projeto, para DAD e PDS não se misturarem só porque saíram no
  // mesmo dia. O período recorta as duas ao mesmo tempo — são a mesma pergunta
  // feita sobre dois acontecimentos.
  const noPeriodo = useCallback(
    (itens: JiraDatedItem[]) => (periodo === 'hoje' ? itens.filter((i) => i.today) : itens),
    [periodo],
  );

  const entregues = useMemo(() => noPeriodo(delivered.data ?? []), [delivered.data, noPeriodo]);
  const entreguesProjects = useMemo(() => buildJiraTree(entregues), [entregues]);

  const aprovados = useMemo(() => noPeriodo(approved.data ?? []), [approved.data, noPeriodo]);
  const aprovadosProjects = useMemo(() => buildJiraTree(aprovados), [aprovados]);

  const problemas = problems.data ?? [];

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
        onChange={(id) => setAba(parseAba(id))}
        tabs={[
          { id: 'abertas', label: 'Em aberto', count: all.length },
          { id: 'entregues', label: 'Entregues', count: entregues.length },
          { id: 'aprovados', label: 'Aprovados', count: aprovados.length },
          { id: 'problemas', label: 'Problemas', count: problemas.length },
        ]}
      />

      {/* O período pertence às duas listas fechadas, e não a uma delas: ficar
          fora do painel da aba evita duas barras iguais e mantém o recorte
          visível ao trocar de aba. */}
      {(aba === 'entregues' || aba === 'aprovados') && (
        <FilterBar label="Período">
          {(Object.keys(PERIODO_LABEL) as Periodo[]).map((p) => (
            <Chip key={p} active={periodo === p} onClick={() => setPeriodo(p)}>
              {PERIODO_LABEL[p]}
            </Chip>
          ))}
        </FilterBar>
      )}

      {aba === 'entregues' && (
        <div id="jira-panel-entregues" role="tabpanel" aria-labelledby="jira-tab-entregues">
          {delivered.error && <PanelError>{delivered.error}</PanelError>}

          {loading && entregues.length === 0 && <SkeletonRows count={3} />}

          {!loading && entregues.length === 0 && !delivered.error && (
            <EmptyState
              title={
                periodo === 'hoje'
                  ? 'Nenhuma issue entregue hoje.'
                  : 'Nenhuma issue entregue nos últimos 7 dias.'
              }
            />
          )}

          <JiraProjects
            groups={entreguesProjects}
            expandidos={expandidos}
            onAlternar={alternarRamo}
          />
        </div>
      )}

      {aba === 'aprovados' && (
        <div id="jira-panel-aprovados" role="tabpanel" aria-labelledby="jira-tab-aprovados">
          {approved.error && <PanelError>{approved.error}</PanelError>}

          {loading && aprovados.length === 0 && <SkeletonRows count={3} />}

          {!loading && aprovados.length === 0 && !approved.error && (
            <EmptyState
              title={
                periodo === 'hoje'
                  ? 'Nenhuma issue aprovada hoje.'
                  : 'Nenhuma issue aprovada nos últimos 7 dias.'
              }
            />
          )}

          <JiraProjects
            groups={aprovadosProjects}
            expandidos={expandidos}
            onAlternar={alternarRamo}
          />
        </div>
      )}

      {aba === 'problemas' && (
        <div id="jira-panel-problemas" role="tabpanel" aria-labelledby="jira-tab-problemas">
          {problems.error && <PanelError>{problems.error}</PanelError>}

          {loading && problemas.length === 0 && <SkeletonRows count={3} />}

          {!loading && problemas.length === 0 && !problems.error && (
            <EmptyState title="Nenhuma história ou épico com problema." />
          )}

          <ul>
            {problemas.map((issue) => (
              <JiraProblemRow key={issue.key} issue={issue} />
            ))}
          </ul>
        </div>
      )}

      {aba === 'abertas' && (
        <div id="jira-panel-abertas" role="tabpanel" aria-labelledby="jira-tab-abertas">
          <FilterBar label="Filtrar issues">
            <SearchInput
              value={query}
              onChange={setQuery}
              label="buscar issues"
              placeholder="chave ou resumo"
            />
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
          <div className="mb-4 border-b border-line-soft pb-4">
            <h3 className={groupLabel}>
              Acompanhando
              {acompanhadas.length > 0 && (
                <span className={cn('font-normal text-ink-dim', tabular)}>
                  {' '}
                  {acompanhadas.length}
                </span>
              )}
            </h3>

            <div className="my-2 flex gap-2">
              <Input
                className="max-w-48"
                aria-label="acompanhar issue do Jira"
                placeholder="ABC-123"
                value={novaChave}
                onChange={(e) => setNovaChave(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void acompanhar();
                }}
              />
              <IconAction
                variant="outline"
                size="icon"
                label={salvando ? 'Buscando…' : 'Acompanhar issue'}
                disabled={salvando || novaChave.trim().length === 0}
                onClick={() => void acompanhar()}
                icon={<Plus className={cn('size-4', salvando && 'animate-pulse')} />}
              />
            </div>

            {watchError && <PanelError>{watchError}</PanelError>}
            {watched.error && <PanelError>{watched.error}</PanelError>}

            {acompanhadas.length === 0 && !watchError && (
              <p className={emptyNote}>Nenhuma issue acompanhada.</p>
            )}

            <ul>
              {acompanhadas.map((issue) => (
                <li key={issue.key} className={rowShell}>
                  <span className="shrink-0 type-caption leading-6 text-ink-dim">
                    {issueMarker(issue)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex min-w-0 items-baseline gap-3">
                      <a
                        className={cn(
                          'shrink-0 font-mono text-sm text-brand hover:underline',
                          focusRing,
                        )}
                        href={issue.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {issue.key}
                      </a>
                      <span className="min-w-0 flex-1 truncate text-ink">{issue.summary}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-ink-dim">
                      <JiraStatus issue={issue} />
                      {stalenessLabel(issue) && (
                        <span className="whitespace-nowrap text-warning">
                          {stalenessLabel(issue)}
                        </span>
                      )}
                      {issue.dueDate && dueLabel(issue.dueDate) && (
                        <span
                          className={cn(
                            'whitespace-nowrap',
                            isOverdue(issue.dueDate) ? 'is-overdue text-danger' : 'text-ink-dim',
                          )}
                        >
                          {dueLabel(issue.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <IconAction
                    className="shrink-0 text-ink-dim hover:bg-danger-tint hover:text-danger"
                    label={`parar de acompanhar ${issue.key}`}
                    onClick={() => void parar(issue.key)}
                    icon={<X className="size-4" />}
                  />
                </li>
              ))}
            </ul>
          </div>

          {jira.error && <PanelError>{jira.error}</PanelError>}

          {loading && all.length === 0 && <SkeletonRows count={5} />}

          {!loading && all.length === 0 && !jira.error && (
            <EmptyState title="Nenhuma issue atribuída." />
          )}

          {all.length > 0 && visible.length === 0 && (
            <EmptyState title="Nenhuma issue com esses filtros." />
          )}

          {grouped &&
            visible.length > 0 &&
            situations.map((group) => (
              <div key={group.category} className="mt-5 first:mt-0">
                <h3 className={groupLabel}>
                  {group.label}
                  <span className={cn('font-normal text-ink-dim', tabular)}>
                    {' '}
                    {group.issues.length}
                  </span>
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

/** Uma issue da aba de problemas: o que ela é e tudo o que está faltando nela,
 *  para corrigir de uma vez ao abrir no Jira. */
function JiraProblemRow({ issue }: { issue: JiraProblemItem }) {
  return (
    <li className={rowShell}>
      <span className="shrink-0 type-caption leading-6 text-ink-dim">{issueMarker(issue)}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <a
            className={cn('shrink-0 font-mono text-sm text-brand hover:underline', focusRing)}
            href={issue.url}
            target="_blank"
            rel="noreferrer"
          >
            {issue.key}
          </a>
          <span className="min-w-0 flex-1 truncate text-ink">{issue.summary}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-ink-dim">
          <JiraStatus issue={issue} />
          <ul className="contents" aria-label={`problemas de ${issue.key}`}>
            {issue.problems.map((problem) => (
              <li
                key={problem}
                className={cn(roleBadge, 'border-warning/45 bg-warning-tint text-warning')}
              >
                {PROBLEM_LABEL[problem]}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
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
        <div key={group.project} className="mt-5 first:mt-0">
          <h3 className={groupLabel}>
            {group.project}
            <span className={cn('font-normal text-ink-dim', tabular)}> {group.count}</span>
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
      className={rowShell}
      style={{ paddingLeft: depth > 0 ? `calc(${depth} * var(--s4))` : undefined }}
    >
      {/* A branch tick reads as hierarchy without drawing a full tree of guides. */}
      {depth > 0 && (
        <span
          className="-mr-2 size-2 shrink-0 -translate-y-0.5 rounded-bl-[3px] border-b border-l border-line-strong"
          aria-hidden="true"
        />
      )}
      {/* A seta só existe onde há o que revelar. Numa issue sem filha ela
          seria um controle que não faz nada — o espaçador mantém o
          alinhamento da coluna. */}
      {filhos > 0 && onAlternar ? (
        <button
          type="button"
          className={cn(caret, focusRing)}
          aria-label={`${aberto ? 'recolher' : 'expandir'} ${filhos === 1 ? 'a issue' : `as ${filhos} issues`} sob ${issue.key}`}
          aria-expanded={aberto}
          onClick={onAlternar}
        >
          <NavArrowRight width={14} height={14} />
        </button>
      ) : (
        <span className="inline-block size-[18px] shrink-0" aria-hidden="true" />
      )}
      <span className="shrink-0 type-caption leading-6 text-ink-dim">{issueMarker(issue)}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <a
            className={cn('shrink-0 font-mono text-sm text-brand hover:underline', focusRing)}
            href={issue.url}
            target="_blank"
            rel="noreferrer"
          >
            {issue.key}
          </a>
          <span className="min-w-0 flex-1 truncate text-ink">{issue.summary}</span>
          {showRole && eRelator && (
            <span className={cn(roleBadge, 'border-line-strong bg-neutral-tint text-ink-dim')}>
              REL
            </span>
          )}
          {/* A pending decision is the only mark that asks something of the reader,
              so it is the one that pulls more attention than the role badge. */}
          {issue.awaitingApproval && (
            <span
              className={cn(
                roleBadge,
                'border-warning/45 bg-warning-tint font-semibold text-warning',
              )}
              title="aguardando a sua aprovação"
            >
              APROV
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-ink-dim">
          <JiraStatus issue={issue} />
          {parado && <span className="whitespace-nowrap text-warning">{parado}</span>}
          {prazo && (
            <span
              className={cn(
                'whitespace-nowrap',
                atrasado ? 'is-overdue text-danger' : 'text-ink-dim',
              )}
            >
              {prazo}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
