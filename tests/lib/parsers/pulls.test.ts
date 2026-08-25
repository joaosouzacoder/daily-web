import { describe, expect, it } from 'vitest';
import { parsePulls, parseGhpendingConfig, serializeGhpendingConfig } from '@/lib/parsers/pulls';

describe('parsePulls', () => {
  it('remove linhas em branco nas pontas mas preserva as do meio', () => {
    expect(parsePulls('\n\na\n\nb\n\n')).toEqual(['a', '', 'b']);
  });

  it('devolve lista vazia quando não há conteúdo', () => {
    expect(parsePulls('')).toEqual([]);
    expect(parsePulls('\n\n')).toEqual([]);
  });

  it('preserva o conteúdo de uma linha só', () => {
    expect(parsePulls('só uma linha')).toEqual(['só uma linha']);
  });
});

describe('parseGhpendingConfig', () => {
  it('lê repos e user de um config real', () => {
    const text = 'user = "octocat"\nrepos = ["owner/repo", "foo/bar"]\n';
    expect(parseGhpendingConfig(text)).toEqual({ user: 'octocat', repos: ['owner/repo', 'foo/bar'] });
  });

  it('devolve repos vazio quando o arquivo não tem a chave', () => {
    expect(parseGhpendingConfig('')).toEqual({ repos: [] });
  });

  it('funciona sem user', () => {
    expect(parseGhpendingConfig('repos = ["a/b"]\n')).toEqual({ repos: ['a/b'] });
  });
});

describe('serializeGhpendingConfig', () => {
  it('serializa repos sem user', () => {
    expect(serializeGhpendingConfig({ repos: ['a/b', 'c/d'] })).toBe('repos = ["a/b", "c/d"]\n');
  });

  it('serializa com user quando presente', () => {
    expect(serializeGhpendingConfig({ user: 'octocat', repos: ['a/b'] })).toBe(
      'user = "octocat"\nrepos = ["a/b"]\n',
    );
  });

  it('faz round-trip com parseGhpendingConfig', () => {
    const cfg = { user: 'octocat', repos: ['owner/repo', 'foo/bar'] };
    expect(parseGhpendingConfig(serializeGhpendingConfig(cfg))).toEqual(cfg);
  });
});
