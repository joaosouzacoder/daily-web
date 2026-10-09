import { matchesQuery } from '@/lib/filters';
import { isJiraKey } from '@/lib/jiraKey';
import type { JiraItem } from '@/lib/types';

/** Os três degraus que o painel deixa escolher. O Jira desta instância tem
 *  objetivo acima e subtarefa abaixo, mas é nestes que o trabalho se organiza. */
export type JiraTier = 'initiative' | 'epic' | 'story';

export const JIRA_TIERS: readonly JiraTier[] = ['initiative', 'epic', 'story'];

export const JIRA_TIER_LABEL: Record<JiraTier, string> = {
  initiative: 'Iniciativas',
  epic: 'Épicos',
  story: 'Histórias',
};

const TIER_LEVEL: Record<JiraTier, number> = { initiative: 2, epic: 1, story: 0 };

export function tierOf(item: JiraItem): JiraTier | null {
  return JIRA_TIERS.find((tier) => TIER_LEVEL[tier] === item.hierarchyLevel) ?? null;
}

/** O recorte do painel do Jira. Vazio é "sem filtro"; cada campo é
 *  independente, e os três de hierarquia se somam: escolher épico dentro de
 *  uma iniciativa restringe mais, não troca. */
export interface JiraFilterState {
  query: string;
  status: string;
  tier: JiraTier | null;
  initiative: string;
  epic: string;
  story: string;
}

export const EMPTY_JIRA_FILTERS: JiraFilterState = {
  query: '',
  status: '',
  tier: null,
  initiative: '',
  epic: '',
  story: '',
};

const PARAMS = {
  query: 'jiraBusca',
  status: 'jiraStatus',
  tier: 'jiraTipo',
  initiative: 'jiraIniciativa',
  epic: 'jiraEpico',
  story: 'jiraHistoria',
} as const;

const MAX_TEXT = 200;

function text(raw: string | null): string {
  if (!raw) return '';
  return raw.length > MAX_TEXT ? '' : raw;
}

function key(raw: string | null): string {
  return raw && isJiraKey(raw) ? raw.toUpperCase() : '';
}

/** A URL é entrada não confiável: o que não é um valor que a tela produz cai
 *  no padrão em vez de virar estado. */
export function parseJiraFilters(params: URLSearchParams): JiraFilterState {
  const tier = params.get(PARAMS.tier);
  return {
    query: text(params.get(PARAMS.query)),
    status: text(params.get(PARAMS.status)),
    tier: JIRA_TIERS.find((t) => t === tier) ?? null,
    initiative: key(params.get(PARAMS.initiative)),
    epic: key(params.get(PARAMS.epic)),
    story: key(params.get(PARAMS.story)),
  };
}

/** Escreve o recorte na URL existente, preservando o resto. O vazio sai da
 *  URL para o link continuar limpo. */
export function jiraFiltersToParams(
  current: URLSearchParams,
  filters: JiraFilterState,
): URLSearchParams {
  const params = new URLSearchParams(current);
  const put = (name: string, value: string) => {
    if (value) params.set(name, value);
    else params.delete(name);
  };
  put(PARAMS.query, filters.query);
  put(PARAMS.status, filters.status);
  put(PARAMS.tier, filters.tier ?? '');
  put(PARAMS.initiative, filters.initiative);
  put(PARAMS.epic, filters.epic);
  put(PARAMS.story, filters.story);
  return params;
}

export function hasJiraFilters(filters: JiraFilterState): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.status !== '' ||
    filters.tier !== null ||
    filters.initiative !== '' ||
    filters.epic !== '' ||
    filters.story !== ''
  );
}

// Teto da subida: a hierarquia tem cinco degraus. O limite existe para um
// pai que aponte de volta não virar laço.
const MAX_LINEAGE = 8;

/** Os ancestrais conhecidos da issue, do pai para cima. */
export function lineageOf(item: JiraItem, byKey: Map<string, JiraItem>): JiraItem[] {
  const lineage: JiraItem[] = [];
  const seen = new Set([item.key]);
  let parentKey = item.parent?.key;
  while (parentKey && !seen.has(parentKey) && lineage.length < MAX_LINEAGE) {
    const parent = byKey.get(parentKey);
    if (!parent) break;
    lineage.push(parent);
    seen.add(parentKey);
    parentKey = parent.parent?.key;
  }
  return lineage;
}

function underOrSelf(item: JiraItem, lineage: JiraItem[], selected: string): boolean {
  return !selected || item.key === selected || lineage.some((a) => a.key === selected);
}

function sameStatus(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function matchesJiraFilters(
  item: JiraItem,
  filters: JiraFilterState,
  byKey: Map<string, JiraItem>,
): boolean {
  if (filters.status && !sameStatus(item.status, filters.status)) return false;
  if (filters.tier && tierOf(item) !== filters.tier) return false;

  const lineage = lineageOf(item, byKey);
  if (!underOrSelf(item, lineage, filters.initiative)) return false;
  if (!underOrSelf(item, lineage, filters.epic)) return false;
  if (!underOrSelf(item, lineage, filters.story)) return false;

  // A busca olha o caminho inteiro: procurar pelo nome da iniciativa traz o
  // que está debaixo dela, que é o que se quer ver ao lembrar só do tema.
  const campos = [item, ...lineage].flatMap((i) => [i.key, i.summary]);
  return matchesQuery(campos, filters.query);
}

export interface JiraFilterOptions {
  statuses: string[];
  initiatives: JiraItem[];
  epics: JiraItem[];
  stories: JiraItem[];
}

/**
 * O que cada seletor oferece para a lista da aba. Os de hierarquia descem em
 * cascata: com uma iniciativa escolhida, os épicos são só os dela, e as
 * histórias só as do épico (ou da iniciativa) escolhido. Uma opção sem nada da
 * lista debaixo dela não leva a lugar nenhum e não aparece.
 */
export function jiraFilterOptions(
  items: JiraItem[],
  byKey: Map<string, JiraItem>,
  filters: JiraFilterState,
): JiraFilterOptions {
  const statuses = new Map<string, string>();
  const pool = new Map<string, { item: JiraItem; lineage: JiraItem[] }>();

  for (const item of items) {
    const normalized = item.status.trim().toLowerCase();
    if (normalized && !statuses.has(normalized)) statuses.set(normalized, item.status.trim());
    const lineage = lineageOf(item, byKey);
    for (const [i, node] of [item, ...lineage].entries()) {
      if (!pool.has(node.key)) pool.set(node.key, { item: node, lineage: lineage.slice(i) });
    }
  }

  const ofTier = (tier: JiraTier, within: string[]) =>
    [...pool.values()]
      .filter(({ item }) => tierOf(item) === tier)
      .filter(({ item, lineage }) => within.every((sel) => underOrSelf(item, lineage, sel)))
      .map(({ item }) => item)
      .sort((a, b) => a.summary.localeCompare(b.summary));

  return {
    statuses: [...statuses.values()].sort((a, b) => a.localeCompare(b)),
    initiatives: ofTier('initiative', []),
    epics: ofTier('epic', [filters.initiative]),
    stories: ofTier('story', [filters.initiative, filters.epic]),
  };
}
