import { describe, expect, it } from 'vitest';
import { parsePulls } from '@/lib/parsers/pulls';

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
