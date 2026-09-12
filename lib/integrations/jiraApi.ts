import type { Connection } from '@/lib/vault/connections';
import type {
  JiraDatedItem,
  JiraItem,
  JiraProblemItem,
  JiraRole,
  JiraStatusCategory,
} from '@/lib/types';
import type { JiraFilter } from '@/lib/parsers/jira';
import { findProblems, isEpic } from '@/lib/parsers/jiraProblems';
import type { JiraAuditIssue } from '@/lib/parsers/jiraProblems';
import { isJiraKey } from '@/lib/preferences';

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
    awaitingApproval: false,
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
  nextPageToken?: string;
  isLast?: boolean;
}

async function search(auth: JiraAuth, jql: string): Promise<RawIssue[]> {
  const payload = { jql, fields: FIELDS, maxResults: PAGE_SIZE };
  const data = (await request(auth, '/rest/api/3/search/jql', payload)) as SearchResponse;
  return data.issues ?? [];
}

const OPEN = 'statusCategory != Done';

// O que espera por uma decisão sua. `myPending()` é a função que a instância
// aceita — `pendingBy(currentUser())` é recusada com erro de sintaxe — e é ela
// que separa o que aguarda você do que apenas está parado num status chamado
// "Aprovação", que pode estar esperando outra pessoa. Depender do nome do
// status traria a issue errada.
const AWAITING_MY_APPROVAL = `approvals = myPending() AND ${OPEN} ORDER BY updated DESC`;

/** Uma issue pode ser sua como responsável e como relator ao mesmo tempo; a
 *  união é feita por chave para ela não aparecer duas vezes na lista.
 *
 *  A aprovação entra na mesma união, e não como lista à parte, porque é a
 *  mesma pergunta — "o que ainda pede algo de mim" — e porque uma issue que
 *  seja sua e espere sua aprovação precisa continuar sendo uma linha só. */
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

  // Buscada sempre, inclusive quando o filtro é só responsável ou só relator:
  // aprovar não é um papel seu na issue, e o filtro de papel não deveria
  // esconder o que espera por você.
  for (const raw of await search(auth, AWAITING_MY_APPROVAL)) {
    const existing = byKey.get(raw.key);
    // A issue que já veio pelo papel mantém o papel e ganha a marca. A que só
    // aparece por aprovação não tem papel seu: nem responsável, nem relator.
    // Entra com o valor neutro que o resto do módulo já usa nesse caso, para
    // não afirmar um papel que não é seu — quem explica a presença dela na
    // lista é a marca de aprovação, não o papel.
    const item = existing ?? toJiraItem(raw, auth.baseUrl, 'assignee');
    item.awaitingApproval = true;
    byKey.set(raw.key, item);
  }

  return [...byKey.values()];
}

// As duas janelas que o painel oferece. A lista buscada é sempre a maior, e a
// menor serve só para marcar o que cabe no dia: trocar o período na tela é um
// recorte do que já está em memória, não uma nova ida ao Jira. O corte do dia
// continua sendo o do Jira (`startOfDay()`, no fuso do perfil), e não uma
// conta de data feita no navegador, que divergiria do que a interface do
// Atlassian mostra.
const WEEK = 'startOfDay(-7d)';
const TODAY = 'startOfDay()';

/** Marca, na lista da semana, quem também apareceu na busca do dia. */
function withToday(week: RawIssue[], today: RawIssue[], baseUrl: string): JiraDatedItem[] {
  const doDia = new Set(today.map((issue) => issue.key));
  return week.map((issue) => ({
    ...toJiraItem(issue, baseUrl, 'assignee'),
    today: doDia.has(issue.key),
  }));
}

// O que saiu das suas mãos. Duas condições, unidas porque as instâncias
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
const delivered = (desde: string) =>
  'statusCategory = Done AND (' +
  `status CHANGED BY currentUser() DURING (${desde}, now())` +
  ` OR (assignee = currentUser() AND resolved >= ${desde})` +
  ') ORDER BY updated DESC';

/** Issues que este usuário encerrou nos últimos sete dias, marcadas conforme
 *  caiam ou não no dia de hoje. */
export async function fetchDelivered(conn: Connection): Promise<JiraDatedItem[]> {
  const auth = jiraAuth(conn);
  const [week, today] = await Promise.all([
    search(auth, delivered(WEEK)),
    search(auth, delivered(TODAY)),
  ]);
  return withToday(week, today, auth.baseUrl);
}

// O que você aprovou. Não há função JQL para isto: `myApproved()` e
// `myDecided()` não existem, e `approvedBy(currentUser())` é recusada — o
// campo `approvals` não aceita função com argumento. `approved()` sozinho
// responde "aprovada por alguém", incluindo aprovações de outras pessoas.
//
// O que restringe a você é a transição de saída da aprovação ter sido sua.
// Diferente das outras consultas deste módulo, esta cita o nome do status:
// sem `FROM "Aprovação"`, uma issue aprovada por outra pessoa entra na lista
// assim que você mexe no status dela — foi medido contra a API de aprovação,
// e o nome é o que separa os dois casos. O preço é conhecido: se o workflow
// renomear esse status, a lista esvazia em silêncio.
const approved = (desde: string) =>
  'approvals = approved() AND ' +
  `status CHANGED FROM "Aprovação" BY currentUser() DURING (${desde}, now())` +
  ' ORDER BY updated DESC';

/** Issues que este usuário aprovou nos últimos sete dias, marcadas conforme
 *  caiam ou não no dia de hoje. */
export async function fetchApproved(conn: Connection): Promise<JiraDatedItem[]> {
  const auth = jiraAuth(conn);
  const [week, today] = await Promise.all([
    search(auth, approved(WEEK)),
    search(auth, approved(TODAY)),
  ]);
  return withToday(week, today, auth.baseUrl);
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

// A aba de problemas não pode parar na primeira página como as outras: uma
// filha que ficasse de fora faria o épico dela aparecer como "sem histórias".
// Então pagina até o fim, com um teto — passar dele é erro dito, não uma
// lista cortada em silêncio.
const MAX_PAGES = 10;

async function searchAll(auth: JiraAuth, jql: string, fields: string[]): Promise<RawIssue[]> {
  const issues: RawIssue[] = [];
  let nextPageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const payload = { jql, fields, maxResults: PAGE_SIZE, ...(nextPageToken ? { nextPageToken } : {}) };
    const data = (await request(auth, '/rest/api/3/search/jql', payload)) as SearchResponse;
    issues.push(...(data.issues ?? []));
    if (data.isLast !== false || !data.nextPageToken) return issues;
    nextPageToken = data.nextPageToken;
  }
  throw new Error(`a busca do Jira passou de ${MAX_PAGES * PAGE_SIZE} issues`);
}

interface JiraField {
  id?: string;
  name?: string;
}

// A data de início é um campo personalizado, com id diferente em cada
// instância. O nome é o que se repete — em inglês ou no idioma do perfil.
const START_FIELD_NAMES = ['start date', 'data de início', 'data de inicio'];

async function startDateField(auth: JiraAuth): Promise<string> {
  const fields = (await request(auth, '/rest/api/3/field', undefined)) as JiraField[];
  const field = fields.find((f) => START_FIELD_NAMES.includes(f.name?.trim().toLowerCase() ?? ''));
  // Sem o campo, toda história em andamento pareceria sem início. Melhor dizer
  // que não dá para checar do que acusar a lista inteira.
  if (!field?.id) throw new Error('campo "Start date" não encontrado no Jira');
  return field.id;
}

// Histórias e épicos seus que ainda pedem atenção: o que está aberto e o que
// mudou no último mês. Sem o recorte de tempo, todo o histórico concluído
// entraria só para ser conferido.
const PROBLEM_SCOPE =
  '(assignee = currentUser() OR reporter = currentUser()) AND ' +
  '(statusCategory != Done OR updated >= -30d) ORDER BY updated DESC';

// Chaves por consulta de filhas: mantém a JQL de tamanho previsível.
const EPIC_CHUNK = 50;

/** Histórias e épicos seus com defeito de preenchimento. São duas idas ao
 *  Jira além da descoberta do campo, e não uma por épico: as filhas de todos
 *  os épicos vêm juntas, por `parent in (...)`. */
export async function fetchProblems(conn: Connection): Promise<JiraProblemItem[]> {
  const auth = jiraAuth(conn);
  const startField = await startDateField(auth);

  const raw = await searchAll(auth, PROBLEM_SCOPE, [...FIELDS, startField]);
  const scope: JiraAuditIssue[] = raw.map((issue) => {
    const fields = (issue.fields ?? {}) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === 'string' ? value : '');
    return {
      ...toJiraItem(issue, auth.baseUrl, 'assignee'),
      startDate: text(fields[startField]),
    };
  });

  // As chaves vêm do próprio Jira, mas entram numa JQL: a mesma validação da
  // lista de acompanhamento vale aqui.
  const epicKeys = scope.filter(isEpic).map((i) => i.key).filter(isJiraKey);
  const chunks: string[][] = [];
  for (let i = 0; i < epicKeys.length; i += EPIC_CHUNK) chunks.push(epicKeys.slice(i, i + EPIC_CHUNK));

  const children = (
    await Promise.all(
      chunks.map((keys) =>
        searchAll(auth, `parent in (${keys.map((k) => `"${k}"`).join(', ')})`, FIELDS),
      ),
    )
  )
    .flat()
    .map((issue) => toJiraItem(issue, auth.baseUrl, 'assignee'));

  return findProblems(scope, children);
}

export async function testConnection(conn: Connection): Promise<void> {
  await request(jiraAuth(conn), '/rest/api/3/myself', undefined);
}
