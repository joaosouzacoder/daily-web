import { describe, expect, it } from 'vitest';
import { matchesQuery } from '@/lib/filters';

describe('matchesQuery', () => {
  it('devolve true quando a busca está vazia', () => {
    expect(matchesQuery(['qualquer coisa'], '')).toBe(true);
    expect(matchesQuery(['qualquer coisa'], '   ')).toBe(true);
  });

  it('acha o termo em qualquer um dos campos', () => {
    expect(matchesQuery(['Assunto do e-mail', 'milton@example.com'], 'milton')).toBe(true);
  });

  it('ignora diferença de maiúsculas', () => {
    expect(matchesQuery(['Revisão do PR'], 'revisão')).toBe(true);
  });

  it('ignora acentos nos dois lados', () => {
    expect(matchesQuery(['Revisão do PR'], 'revisao')).toBe(true);
    expect(matchesQuery(['Revisao do PR'], 'revisão')).toBe(true);
  });

  it('devolve false quando nenhum campo contém o termo', () => {
    expect(matchesQuery(['Assunto', 'remetente'], 'inexistente')).toBe(false);
  });

  it('ignora campos vazios sem quebrar', () => {
    expect(matchesQuery(['', 'texto'], 'texto')).toBe(true);
  });
});
