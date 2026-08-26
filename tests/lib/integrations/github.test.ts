import { describe, expect, it } from 'vitest';
import { parseRepoList, rankPulls, serializeRepoList, toPullItems } from '@/lib/integrations/githubApi';
import type { PullRequestItem } from '@/lib/types';

const ME = 'joaosouzacoder';

function raw(over: Record<string, unknown> = {}) {
  return {
    number: 1,
    title: 'Bump lib',
    html_url: 'https://github.com/joao/repo/pull/1',
    draft: false,
    user: { login: 'dependabot[bot]' },
    requested_reviewers: [],
    updated_at: '2026-08-26T10:00:00Z',
    ...over,
  };
}

describe('toPullItems', () => {
  // Filtrar por "seu ou pediram sua revisão" escondia o PR do dependabot,
  // que é justamente o que fica esperando no seu próprio repositório.
  it('inclui PR que não é seu e não pediu sua revisão', () => {
    const items = toPullItems([raw()], 'joao/repo', ME);
    expect(items).toHaveLength(1);
    expect(items[0].mine).toBe(false);
    expect(items[0].awaitingYou).toBe(false);
    expect(items[0].author).toBe('dependabot[bot]');
  });

  it('marca o PR que é seu', () => {
    const [item] = toPullItems([raw({ user: { login: ME } })], 'joao/repo', ME);
    expect(item.mine).toBe(true);
  });

  it('marca quando pediram a sua revisão', () => {
    const [item] = toPullItems(
      [raw({ requested_reviewers: [{ login: ME }] })],
      'joao/repo',
      ME,
    );
    expect(item.awaitingYou).toBe(true);
  });

  it('preserva rascunho e a origem do repositório', () => {
    const [item] = toPullItems([raw({ draft: true })], 'joao/repo', ME);
    expect(item.draft).toBe(true);
    expect(item.repo).toBe('joao/repo');
  });
});

function item(over: Partial<PullRequestItem>): PullRequestItem {
  return {
    repo: 'joao/repo',
    number: 1,
    title: 't',
    url: 'u',
    author: 'a',
    draft: false,
    awaitingYou: false,
    mine: false,
    updatedAt: '2026-08-01T00:00:00Z',
    ...over,
  };
}

describe('rankPulls', () => {
  it('põe primeiro o que pediram para você revisar, depois o seu', () => {
    const ordered = rankPulls([
      item({ number: 1 }),
      item({ number: 2, mine: true }),
      item({ number: 3, awaitingYou: true }),
    ]);
    expect(ordered.map((p) => p.number)).toEqual([3, 2, 1]);
  });

  it('desempata pelo mais recente', () => {
    const ordered = rankPulls([
      item({ number: 1, updatedAt: '2026-08-01T00:00:00Z' }),
      item({ number: 2, updatedAt: '2026-08-20T00:00:00Z' }),
    ]);
    expect(ordered.map((p) => p.number)).toEqual([2, 1]);
  });
});

describe('lista de repositórios', () => {
  it('lê e escreve a lista separada por vírgula, ignorando espaços', () => {
    expect(parseRepoList(' a/b ,c/d , ')).toEqual(['a/b', 'c/d']);
    expect(serializeRepoList(['a/b', 'c/d'])).toBe('a/b, c/d');
  });

  it('devolve vazio para string vazia', () => {
    expect(parseRepoList('')).toEqual([]);
  });
});
