import type { Connection } from '@/lib/vault/connections';
import type { PullsDigest, PullRequestItem } from '@/lib/types';
import { isValidRepo } from '@/lib/api/validation';

const TIMEOUT_MS = 20_000;
const API = 'https://api.github.com';

export function parseRepoList(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function serializeRepoList(repos: string[]): string {
  return repos.join(', ');
}

export function githubToken(conn: Connection): string {
  const token = (conn.values.token ?? '').trim();
  if (!token) throw new Error('personal access token do GitHub não configurado');
  return token;
}

/** A hora em que a cota do GitHub volta, já em relógio de parede: o cabeçalho
 *  vem em segundos desde a época, que não diz nada a quem lê a mensagem. */
function resetAt(header: string | null): string {
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  return new Date(seconds * 1000).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Reply {
  data: unknown;
  headers: Headers;
}

async function call(token: string, path: string): Promise<Reply> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status === 401) throw new Error('o GitHub recusou o token');
  if (response.status === 403) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      // Quanto sobrou e quando volta: sem isso a única saída é tentar de novo
      // até acertar a hora.
      const volta = resetAt(response.headers.get('x-ratelimit-reset'));
      throw new Error(
        `limite de requisições do GitHub atingido — restam 0${volta ? `, volta às ${volta}` : ''}`,
      );
    }
    throw new Error('o token não tem permissão');
  }
  if (!response.ok) throw new Error(`GitHub respondeu ${response.status}`);
  return { data: await response.json(), headers: response.headers };
}

async function request(token: string, path: string): Promise<unknown> {
  return (await call(token, path)).data;
}

interface RawUser {
  login?: string;
}

// O endpoint /issues devolve issues e pull requests na mesma lista; o campo
// `pull_request` é o que separa os dois. Buscar por ali traz as issues, que
// o endpoint /pulls não devolve, numa chamada só por repositório.
interface RawItem {
  number: number;
  title: string;
  html_url: string;
  draft?: boolean;
  user?: { login?: string } | null;
  requested_reviewers?: { login?: string }[] | null;
  updated_at?: string;
  pull_request?: unknown;
}

/**
 * Todo PR aberto de um repositório acompanhado entra na lista. Filtrar por
 * "seu ou pediram sua revisão" parecia razoável e escondia justamente o caso
 * mais comum num repo próprio: o PR do dependabot, que ninguém atribui e
 * ninguém pede revisão, e que é exatamente o que está esperando por você.
 * Quem escolheu acompanhar o repositório já disse o que quer ver.
 */
export function toPullItems(
  items: RawItem[],
  repo: string,
  login: string,
): PullRequestItem[] {
  return items.map((item) => ({
    repo,
    number: item.number,
    title: item.title,
    url: item.html_url,
    author: item.user?.login ?? '',
    draft: item.draft ?? false,
    awaitingYou: (item.requested_reviewers ?? []).some((r) => r.login === login),
    mine: item.user?.login === login,
    isPullRequest: item.pull_request !== undefined && item.pull_request !== null,
    updatedAt: item.updated_at ?? '',
  }));
}

/** O endereço do repositório no GitHub, ou `null` quando o nome guardado não
 *  tem a forma `dono/nome`. O nome é digitado pelo usuário e aqui vira href:
 *  o que não casa com o formato não vira link, em vez de virar um link torto. */
export function repoUrl(repo: string): string | null {
  if (!isValidRepo(repo)) return null;
  return `https://github.com/${repo}`;
}

export interface RepoGroup {
  repo: string;
  issues: PullRequestItem[];
  pulls: PullRequestItem[];
}

/** Agrupa por repositório e separa issue de pull request. Uma lista corrida
 *  misturava as duas coisas e não dizia de onde cada uma vinha. */
export function groupByRepo(items: PullRequestItem[]): RepoGroup[] {
  const porRepo = new Map<string, RepoGroup>();
  for (const item of items) {
    const grupo = porRepo.get(item.repo) ?? { repo: item.repo, issues: [], pulls: [] };
    (item.isPullRequest ? grupo.pulls : grupo.issues).push(item);
    porRepo.set(item.repo, grupo);
  }
  return [...porRepo.values()]
    .map((g) => ({ ...g, issues: rankPulls(g.issues), pulls: rankPulls(g.pulls) }))
    .sort((a, b) => a.repo.localeCompare(b.repo));
}

/** Primeiro o que pediram para você revisar, depois o que é seu, e o resto
 *  por atualização mais recente. */
export function rankPulls(items: PullRequestItem[]): PullRequestItem[] {
  return [...items].sort(
    (a, b) =>
      Number(b.awaitingYou) - Number(a.awaitingYou) ||
      Number(b.mine) - Number(a.mine) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function trackedRepos(conn: Connection): string[] {
  return parseRepoList(conn.values.repos ?? '');
}

export async function fetchPulls(conn: Connection): Promise<PullsDigest> {
  const token = githubToken(conn);
  const repos = trackedRepos(conn);
  if (repos.length === 0) return { items: [], errors: [] };

  const me = (await request(token, '/user')) as RawUser;
  const login = me.login ?? '';

  const results = await Promise.allSettled(
    repos.map(async (repo) => {
      const items = (await request(
        token,
        `/repos/${repo}/issues?state=open&per_page=100&sort=updated`,
      )) as RawItem[];
      return toPullItems(items, repo, login);
    }),
  );

  const items: PullRequestItem[] = [];
  const errors: string[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') items.push(...result.value);
    // Um repositório renomeado ou sem acesso não pode zerar o painel inteiro.
    else errors.push(`${repos[index]}: ${result.reason instanceof Error ? result.reason.message : result.reason}`);
  });

  return { items: rankPulls(items), errors };
}

// --- Revisões pedidas a você ---------------------------------------------------
//
// Esta lista não tem nada a ver com os repositórios acompanhados: ela vem da
// busca do GitHub, que varre tudo o que o token enxerga. Uma chamada por
// ciclo, nunca uma por repositório.

/** A consulta. `review-requested:@me` é o que ainda espera a sua revisão —
 *  o que você já revisou sai da lista sozinho, porque o GitHub tira o pedido
 *  de revisão quando a revisão chega. */
export const REVIEW_REQUESTS_QUERY = 'is:open is:pr review-requested:@me';

/** Teto de uma página. Cem é o máximo que a busca devolve de uma vez, e uma
 *  segunda página seria uma segunda ida ao GitHub a cada ciclo. */
export const REVIEW_REQUESTS_PER_PAGE = 100;

export function reviewRequestsPath(): string {
  const params = new URLSearchParams({
    q: REVIEW_REQUESTS_QUERY,
    sort: 'updated',
    order: 'desc',
    per_page: String(REVIEW_REQUESTS_PER_PAGE),
  });
  return `/search/issues?${params}`;
}

interface RawSearchItem extends RawItem {
  /** "https://api.github.com/repos/dono/nome" — é daqui que sai o nome do
   *  repositório, já que o resultado é global e o item não traz o nome. */
  repository_url?: string;
  created_at?: string;
}

interface RawSearch {
  total_count?: number;
  incomplete_results?: boolean;
  items?: RawSearchItem[];
}

/** `dono/nome` a partir da URL da API. Uma URL que não tenha essa forma vira
 *  string vazia em vez de um nome torto. */
export function repoFromApiUrl(url: string | undefined): string {
  const match = /\/repos\/([^/]+\/[^/]+)\/?$/.exec(url ?? '');
  return match ? match[1] : '';
}

export function toReviewItems(items: RawSearchItem[]): PullRequestItem[] {
  return items.map((item) => ({
    repo: repoFromApiUrl(item.repository_url),
    number: item.number,
    title: item.title,
    url: item.html_url,
    author: item.user?.login ?? '',
    draft: item.draft ?? false,
    // A busca já filtrou por isto: toda linha aqui espera a sua revisão.
    awaitingYou: true,
    mine: false,
    isPullRequest: true,
    updatedAt: item.updated_at ?? '',
    createdAt: item.created_at ?? '',
  }));
}

/**
 * Por que a lista pode estar vazia sem estar certa. O cabeçalho
 * `x-oauth-scopes` só existe em token clássico: nele dá para ver se falta o
 * escopo `repo`, sem o qual nada de repositório privado aparece. O token
 * fine-grained não declara escopo nenhum aqui — dele só dá para dizer que o
 * alcance é o que foi concedido na criação. Sem lista vazia não há aviso:
 * quem está vendo PRs não precisa ouvir sobre escopo.
 */
export function scopeNote(scopesHeader: string | null, empty: boolean): string | null {
  if (!empty) return null;
  if (scopesHeader === null) {
    return 'Nenhuma revisão pedida a você. Se esperava ver algo, confira: um token fine-grained só enxerga os repositórios concedidos a ele, com permissão de leitura em Pull requests.';
  }
  const scopes = scopesHeader
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!scopes.includes('repo')) {
    return 'Nenhuma revisão pedida a você — e este token clássico não tem o escopo `repo`, então pedidos em repositórios privados não aparecem aqui. Gere um token com `repo` para vê-los.';
  }
  return null;
}

export interface ReviewRequestsDigest {
  items: PullRequestItem[];
  /** A busca achou mais do que coube numa página. */
  truncated: boolean;
  /** Quantos o GitHub diz que existem, para a mensagem do corte. */
  total: number;
  /** Aviso de alcance do token, só quando a lista veio vazia. */
  scopeNote: string | null;
}

export async function fetchReviewRequests(conn: Connection): Promise<ReviewRequestsDigest> {
  const token = githubToken(conn);
  const { data, headers } = await call(token, reviewRequestsPath());
  const busca = (data ?? {}) as RawSearch;
  const items = toReviewItems(busca.items ?? []);
  const total = busca.total_count ?? items.length;

  return {
    items: rankPulls(items),
    truncated: total > items.length || busca.incomplete_results === true,
    total,
    scopeNote: scopeNote(headers.get('x-oauth-scopes'), items.length === 0),
  };
}

export async function testConnection(conn: Connection): Promise<void> {
  await request(githubToken(conn), '/user');
}
