import type { Connection } from '@/lib/vault/connections';
import type { JiraItem, JiraRole, JiraStatusCategory } from '@/lib/types';
import type { JiraFilter } from '@/lib/parsers/jira';

const TIMEOUT_MS = 20_000;
const PAGE_SIZE = 100;

// `updated` e `duedate` são o que transforma a lista em "o que precisa de
// mim": sem eles não dá para saber o que está parado nem o que vence.
const FIELDS = ['summary', 'status', 'project', 'parent', 'issuetype', 'updated', 'duedate'];

export interface JiraAuth {
  baseUrl: string;
  header: string;
}

/** Aceita "acme", "acme.atlassian.net" ou a URL inteira: quem está
 *  configurando copia da barra de endereços, não do manual. */
export function jiraBaseUrl(cloud: string): string {
  const raw = cloud.trim().replace(/\/+$/, '');
  if (!raw) throw new Error('domínio do Jira não configurado');
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.includes('.')) return `https://${raw}`;
  return `https://${raw}.atlassian.net`;
}

export function jiraAuth(conn: Connection): JiraAuth {
  const { cloud = '', email = '', token = '' } = conn.values;
  if (!email.trim() || !token.trim()) throw new Error('e-mail ou API token do Jira não configurados');
  return {
    baseUrl: jiraBaseUrl(cloud),
    header: `Basic ${Buffer.from(`${email.trim()}:${token.trim()}`).toString('base64')}`,
  };
}

interface RawIssue {
  key: string;
  fields?: {
    summary?: string | null;
    updated?: string | null;
    duedate?: string | null;
    status?: {
      name?: string | null;
      statusCategory?: { key?: string | null } | null;
    } | null;
    project?: { key?: string | null } | null;
    issuetype?: { name?: string | null; subtask?: boolean | null } | null;
    parent?: { key?: string; fields?: { summary?: string | null } | null } | null;
  } | null;
}

/** O Jira usa três chaves de categoria; qualquer outra coisa é tratada como
 *  pendente, que é o palpite seguro para uma issue que ainda aparece aqui. */
function toCategory(key: string | null | undefined): JiraStatusCategory {
  if (key === 'indeterminate' || key === 'done') return key;
  return 'new';
}

export function toJiraItem(raw: RawIssue, baseUrl: string, role: JiraRole): JiraItem {
  const fields = raw.fields ?? {};
  return {
    key: raw.key,
    summary: fields.summary ?? '',
    status: fields.status?.name ?? '',
    statusCategory: toCategory(fields.status?.statusCategory?.key),
    updatedAt: fields.updated ?? '',
    dueDate: fields.duedate ?? '',
    project: fields.project?.key ?? raw.key.split('-')[0] ?? '',
    url: `${baseUrl}/browse/${raw.key}`,
    parent: fields.parent
      ? { key: fields.parent.key ?? '', summary: fields.parent.fields?.summary ?? '' }
      : null,
    role,
    kind: fields.issuetype?.name ?? '',
    subtask: fields.issuetype?.subtask ?? false,
  };
}

async function request(auth: JiraAuth, path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${auth.baseUrl}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: auth.header,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status === 401) throw new Error('Jira recusou o e-mail ou o API token');
  if (response.status === 403) throw new Error('o API token do Jira não tem permissão para isso');
  if (response.status === 404) throw new Error('domínio do Jira não encontrado');
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Jira respondeu ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  return response.json();
}

interface SearchResponse {
  issues?: RawIssue[];
}

async function search(auth: JiraAuth, jql: string): Promise<RawIssue[]> {
  const payload = { jql, fields: FIELDS, maxResults: PAGE_SIZE };
  const data = (await request(auth, '/rest/api/3/search/jql', payload)) as SearchResponse;
  return data.issues ?? [];
}

const OPEN = 'statusCategory != Done';

/** Uma issue pode ser sua como responsável e como relator ao mesmo tempo; a
 *  união é feita por chave para ela não aparecer duas vezes na lista. */
export async function fetchIssues(conn: Connection, filter: JiraFilter): Promise<JiraItem[]> {
  const auth = jiraAuth(conn);
  const byKey = new Map<string, JiraItem>();

  const wantAssignee = filter === 'assignee' || filter === 'both';
  const wantReporter = filter === 'reporter' || filter === 'both';

  if (wantAssignee) {
    for (const raw of await search(auth, `assignee = currentUser() AND ${OPEN} ORDER BY updated DESC`)) {
      byKey.set(raw.key, toJiraItem(raw, auth.baseUrl, 'assignee'));
    }
  }
  if (wantReporter) {
    for (const raw of await search(auth, `reporter = currentUser() AND ${OPEN} ORDER BY updated DESC`)) {
      const existing = byKey.get(raw.key);
      if (existing) existing.role = 'both';
      else byKey.set(raw.key, toJiraItem(raw, auth.baseUrl, 'reporter'));
    }
  }

  return [...byKey.values()];
}

// O que saiu das suas mãos hoje. Duas condições, unidas porque as instâncias
// se comportam de formas diferentes:
//
//   - `status CHANGED BY currentUser() DURING (startOfDay(), now())` pega a
//     transição que você mesmo fez. Não depende do nome do status final, que
//     é livre por workflow — este Jira encerra em "Resolvido" e "Fechado",
//     outro encerra em "Done", e listar nomes quebraria fora daqui.
//   - `resolved >= startOfDay()` pega o que foi resolvido no seu nome sem que
//     a transição tenha sido sua, que é o caso de automação de workflow.
//
// `statusCategory = Done` por fora descarta o que você fechou e alguém
// reabriu depois: reaberto não é entregue.
const DELIVERED_TODAY =
  'statusCategory = Done AND (' +
  'status CHANGED BY currentUser() DURING (startOfDay(), now())' +
  ' OR (assignee = currentUser() AND resolved >= startOfDay())' +
  ') ORDER BY updated DESC';

/** Issues que este usuário encerrou hoje. O recorte do dia é o do Jira
 *  (`startOfDay()`), que usa o fuso do perfil de quem está autenticado —
 *  o mesmo que a pessoa vê na interface do Atlassian. */
export async function fetchDeliveredToday(conn: Connection): Promise<JiraItem[]> {
  const auth = jiraAuth(conn);
  const raw = await search(auth, DELIVERED_TODAY);
  return raw.map((issue) => toJiraItem(issue, auth.baseUrl, 'assignee'));
}

interface Myself {
  accountId?: string;
}

// O JQL não tem operador de menção. A menção fica gravada no corpo do
// comentário como `[~accountid:XXX]`, e esse texto é indexado — procurar pelo
// accountId é o caminho que a própria Atlassian documenta.
export async function fetchMentions(conn: Connection): Promise<JiraItem[]> {
  const auth = jiraAuth(conn);
  const me = (await request(auth, '/rest/api/3/myself', undefined)) as Myself;
  if (!me.accountId) return [];

  const raw = await search(
    auth,
    `comment ~ "${me.accountId}" AND updated >= -30d ORDER BY updated DESC`,
  );
  return raw.map((issue) => toJiraItem(issue, auth.baseUrl, 'assignee'));
}

/**
 * Busca issues por chave, para a lista de acompanhamento. As chaves são
 * validadas antes de chegar aqui (`isJiraKey`) porque entram numa JQL — um
 * valor livre nesse ponto seria injeção de consulta.
 */
export async function fetchByKeys(conn: Connection, keys: string[]): Promise<JiraItem[]> {
  if (keys.length === 0) return [];
  const auth = jiraAuth(conn);
  const lista = keys.map((k) => `"${k}"`).join(', ');
  const raw = await search(auth, `key in (${lista}) ORDER BY updated DESC`);
  return raw.map((issue) => toJiraItem(issue, auth.baseUrl, 'assignee'));
}

export async function testConnection(conn: Connection): Promise<void> {
  await request(jiraAuth(conn), '/rest/api/3/myself', undefined);
}
