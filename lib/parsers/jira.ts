import type { JiraItem, JiraStatusCategory } from '@/lib/types';

const TYPE_MARKERS: Record<string, string> = {
  'história': '[S]', historia: '[S]', story: '[S]',
  epic: '[E]', 'épico': '[E]', epico: '[E]',
  iniciativa: '[I]', initiative: '[I]',
  objetivo: '[O]', objective: '[O]',
  '[system] service request': '[R]', 'service request': '[R]',
  'solicitação de serviço': '[R]', 'solicitacao de servico': '[R]',
  'pedido de serviço': '[R]', 'pedido de servico': '[R]',
  'requisição': '[R]', requisicao: '[R]',
};

export function typeMarker(kind: string): string {
  return TYPE_MARKERS[kind.trim().toLowerCase()] ?? '[?]';
}

export function issueMarker(item: JiraItem): string {
  return item.subtask ? '[s]' : typeMarker(item.kind);
}

export interface JiraGroup {
  parentKey: string | null;
  parentSummary: string;
  issues: JiraItem[];
}

export function groupByParent(items: JiraItem[]): JiraGroup[] {
  const groups = new Map<string, JiraGroup>();
  const orphans: JiraItem[] = [];
  for (const item of items) {
    if (!item.parent) {
      orphans.push(item);
      continue;
    }
    const existing = groups.get(item.parent.key);
    if (existing) {
      existing.issues.push(item);
    } else {
      groups.set(item.parent.key, {
        parentKey: item.parent.key,
        parentSummary: item.parent.summary,
        issues: [item],
      });
    }
  }
  const result = [...groups.values()];
  if (orphans.length > 0) {
    result.push({ parentKey: null, parentSummary: 'sem pai', issues: orphans });
  }
  return result;
}

export type JiraFilter = 'assignee' | 'reporter' | 'both';

/** Por que a issue está na árvore: ou ela atende ao recorte da aba, ou está
 *  ali só para ligar o que atende ao topo da hierarquia. O painel conta,
 *  recorta e marca apenas a primeira; a segunda é caminho. */
export type JiraNodeOrigin = 'match' | 'ancestor';

export interface JiraNode {
  issue: JiraItem;
  origin: JiraNodeOrigin;
  children: JiraNode[];
}

export interface JiraProjectGroup {
  project: string;
  roots: JiraNode[];
  count: number;
}

function countNode(node: JiraNode): number {
  const proprio = node.origin === 'match' ? 1 : 0;
  return proprio + node.children.reduce((sum, child) => sum + countNode(child), 0);
}

/** Um ramo só de ancestrais não mostra nada: ele existia para chegar a uma
 *  issue que o recorte da aba deixou de fora. */
function hasMatch(node: JiraNode): boolean {
  return node.origin === 'match' || node.children.some(hasMatch);
}

function pruneNode(node: JiraNode): void {
  node.children = node.children.filter(hasMatch);
  for (const child of node.children) pruneNode(child);
}

// Uma lista plana esconde a relação entre objetivo, iniciativa, épico e
// história. Aqui cada issue vira um nó sob o seu pai e o resultado é separado
// por projeto — assim PDS, que é chamado de serviço, não se mistura com as
// histórias de produto.
//
// `ancestors` são os pais que a busca da aba não traz, porque não são de
// ninguém: sem eles a árvore começaria na história ou no épico, e não no
// objetivo. Entram como caminho, nunca como item do recorte.
export function buildJiraTree(items: JiraItem[], ancestors: JiraItem[] = []): JiraProjectGroup[] {
  const nodes = new Map<string, JiraNode>();
  // O item do recorte vence o ancestral de mesma chave: o épico que é seu
  // continua sendo seu, mesmo que outra issue também aponte para ele.
  for (const issue of ancestors) nodes.set(issue.key, { issue, origin: 'ancestor', children: [] });
  for (const issue of items) nodes.set(issue.key, { issue, origin: 'match', children: [] });

  const roots: JiraNode[] = [];
  for (const node of nodes.values()) {
    const parentKey = node.issue.parent?.key;
    const parent = parentKey && parentKey !== node.issue.key ? nodes.get(parentKey) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const groups = new Map<string, JiraNode[]>();
  for (const root of roots.filter(hasMatch)) {
    pruneNode(root);
    const list = groups.get(root.issue.project) ?? [];
    list.push(root);
    groups.set(root.issue.project, list);
  }

  return [...groups.entries()]
    .map(([project, rootNodes]) => ({
      project,
      roots: rootNodes,
      count: rootNodes.reduce((sum, node) => sum + countNode(node), 0),
    }))
    .sort((a, b) => a.project.localeCompare(b.project));
}

// ---------------------------------------------------------------------------
// Situação, idade e prazo
//
// O painel mostrava só chave, tipo e resumo, mais um selo com o papel
// (responsável ou relator) — que em 15 de 19 issues dizia a mesma coisa e
// portanto não informava nada. O que faltava era justamente o que muda de
// linha para linha: em que situação está, há quanto tempo ninguém toca, e
// quando vence.
// ---------------------------------------------------------------------------

const CATEGORY_LABEL: Record<JiraStatusCategory, string> = {
  indeterminate: 'Em andamento',
  new: 'Pendentes',
  done: 'Concluídas',
};

// O que você já começou vem antes do que ainda não começou.
const CATEGORY_ORDER: JiraStatusCategory[] = ['indeterminate', 'new', 'done'];

/** O nome do status é texto livre configurado por projeto, e o mesmo estado
 *  aparece escrito de formas diferentes — este Jira tem "Em andamento" e
 *  "Em Andamento" como dois status distintos. Comparar sem caixa junta os
 *  dois sem inventar tradução. */
export function normalizeStatus(status: string): string {
  const limpo = status.trim();
  if (!limpo) return '';
  const minusculo = limpo.toLocaleLowerCase('pt-BR');
  return minusculo.charAt(0).toLocaleUpperCase('pt-BR') + minusculo.slice(1);
}

export function daysSince(iso: string, now: Date = new Date()): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

// Abaixo disso, "parado há" seria decoração: quase tudo é mexido a cada dois
// dias, então marcar todos apagaria o sinal de quem está mesmo esquecido.
export const STALE_AFTER_DAYS = 5;

/** "parado há X dias", só quando passou do limite. Null quer dizer "recente
 *  o bastante para não merecer aviso". */
export function stalenessLabel(item: JiraItem, now: Date = new Date()): string | null {
  const dias = daysSince(item.updatedAt, now);
  if (dias === null || dias < STALE_AFTER_DAYS) return null;
  return `parado há ${dias}d`;
}

function localToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** "venceu há 2d", "vence hoje", "vence em 3d", "vence 30/09". A forma
 *  relativa só vale para a semana à frente; além disso a data é mais fácil de
 *  situar do que uma contagem grande. */
export function dueLabel(dueDate: string, now: Date = new Date()): string | null {
  const [ano, mes, dia] = dueDate.split('-').map(Number);
  if (!ano || !mes || !dia) return null;

  const vencimento = new Date(ano, mes - 1, dia);
  const dias = Math.round((vencimento.getTime() - localToday(now).getTime()) / 86_400_000);

  if (dias < 0) return `venceu há ${Math.abs(dias)}d`;
  if (dias === 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  if (dias <= 7) return `vence em ${dias}d`;
  return `vence ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

export function isOverdue(dueDate: string, now: Date = new Date()): boolean {
  const [ano, mes, dia] = dueDate.split('-').map(Number);
  if (!ano || !mes || !dia) return false;
  return new Date(ano, mes - 1, dia).getTime() < localToday(now).getTime();
}

export interface JiraStatusGroup {
  category: JiraStatusCategory;
  label: string;
  issues: JiraItem[];
}

/** Agrupa por situação em vez de por projeto. Agrupar por projeto quase não
 *  agrupa quando 16 de 19 issues são do mesmo — a situação é o eixo que
 *  corresponde a como o dia é organizado. */
export function groupByStatusCategory(items: JiraItem[]): JiraStatusGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    issues: items.filter((item) => item.statusCategory === category),
  })).filter((group) => group.issues.length > 0);
}
