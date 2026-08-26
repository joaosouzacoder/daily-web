import type { Connection } from '@/lib/vault/connections';
import type { PullsDigest, PullRequestItem } from '@/lib/types';

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

interface RawPull {
  number: number;
  title: string;
  html_url: string;
  draft?: boolean;
  user?: { login?: string } | null;
  requested_reviewers?: { login?: string }[] | null;
  updated_at?: string;
}

/** Um PR interessa quando é seu ou quando pediram sua revisão — o resto é
 *  ruído de repositório movimentado. */
export function relevantPulls(
  pulls: RawPull[],
  repo: string,
  login: string,
): PullRequestItem[] {
  return pulls
    .filter(
      (pull) =>
        pull.user?.login === login ||
        (pull.requested_reviewers ?? []).some((r) => r.login === login),
    )
    .map((pull) => ({
      repo,
      number: pull.number,
      title: pull.title,
      url: pull.html_url,
      author: pull.user?.login ?? '',
      draft: pull.draft ?? false,
      awaitingYou: (pull.requested_reviewers ?? []).some((r) => r.login === login),
      updatedAt: pull.updated_at ?? '',
    }));
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
      const pulls = (await request(token, `/repos/${repo}/pulls?state=open&per_page=100`)) as RawPull[];
      return relevantPulls(pulls, repo, login);
    }),
  );

  const items: PullRequestItem[] = [];
  const errors: string[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') items.push(...result.value);
    // Um repositório renomeado ou sem acesso não pode zerar o painel inteiro.
    else errors.push(`${repos[index]}: ${result.reason instanceof Error ? result.reason.message : result.reason}`);
  });

  items.sort((a, b) => Number(b.awaitingYou) - Number(a.awaitingYou) || b.updatedAt.localeCompare(a.updatedAt));
  return { items, errors };
}

export async function testConnection(conn: Connection): Promise<void> {
  await request(githubToken(conn), '/user');
}
