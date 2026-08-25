import type { JiraItem, JiraRole } from '@/lib/types';

interface RawJiraItem {
  key: string;
  summary: string;
  status: string;
  project: string;
  url: string;
  parent?: { key: string; summary: string } | null;
  role?: JiraRole;
  type?: string;
  subtask?: boolean;
}

export function parseIssues(json: string): JiraItem[] {
  const raw: RawJiraItem[] = JSON.parse(json);
  return raw.map((item) => ({
    key: item.key,
    summary: item.summary,
    status: item.status,
    project: item.project,
    url: item.url,
    parent: item.parent ? { key: item.parent.key, summary: item.parent.summary } : null,
    role: item.role ?? 'assignee',
    kind: item.type ?? '',
    subtask: item.subtask ?? false,
  }));
}

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

export interface JiraNode {
  issue: JiraItem;
  children: JiraNode[];
}

export interface JiraProjectGroup {
  project: string;
  roots: JiraNode[];
  count: number;
}

function countNode(node: JiraNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNode(child), 0);
}

// Uma lista plana esconde a relação entre iniciativa, épico e história.
// Aqui cada issue vira um nó sob o seu pai (quando o pai está na lista) e o
// resultado é separado por projeto — assim PDS, que é chamado de serviço,
// não se mistura com as histórias de produto.
export function buildJiraTree(items: JiraItem[]): JiraProjectGroup[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const nodes = new Map<string, JiraNode>(
    items.map((i) => [i.key, { issue: i, children: [] }]),
  );
  const roots: JiraItem[] = [];

  for (const item of items) {
    const parentKey = item.parent?.key;
    if (parentKey && parentKey !== item.key && byKey.has(parentKey)) {
      nodes.get(parentKey)!.children.push(nodes.get(item.key)!);
    } else {
      roots.push(item);
    }
  }

  const groups = new Map<string, JiraNode[]>();
  for (const root of roots) {
    const list = groups.get(root.project) ?? [];
    list.push(nodes.get(root.key)!);
    groups.set(root.project, list);
  }

  return [...groups.entries()]
    .map(([project, rootNodes]) => ({
      project,
      roots: rootNodes,
      count: rootNodes.reduce((sum, node) => sum + countNode(node), 0),
    }))
    .sort((a, b) => a.project.localeCompare(b.project));
}
