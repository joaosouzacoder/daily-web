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

async function request(token: string, path: string): Promise<unknown> {
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
    throw new Error(
      remaining === '0' ? 'limite de requisições do GitHub atingido' : 'o token não tem permissão',
    );
  }
  if (!response.ok) throw new Error(`GitHub respondeu ${response.status}`);
  return response.json();
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

export async function testConnection(conn: Connection): Promise<void> {
  await request(githubToken(conn), '/user');
}
