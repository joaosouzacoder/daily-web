import { describe, expect, it } from 'vitest';
import { matchesQuery, relativeTime } from '@/lib/filters';

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

describe('relativeTime', () => {
  const now = new Date('2026-08-25T12:00:00Z');

  it('mostra agora abaixo de um minuto', () => {
    expect(relativeTime('2026-08-25T11:59:30Z', now)).toBe('agora');
  });

  it('mostra minutos dentro da primeira hora', () => {
    expect(relativeTime('2026-08-25T11:20:00Z', now)).toBe('40min');
  });

  it('mostra horas dentro do mesmo dia', () => {
    expect(relativeTime('2026-08-25T09:00:00Z', now)).toBe('3h');
  });

  it('mostra ontem para o dia anterior', () => {
    expect(relativeTime('2026-08-24T10:00:00Z', now)).toBe('ontem');
  });

  it('mostra dias dentro da semana', () => {
    expect(relativeTime('2026-08-22T10:00:00Z', now)).toBe('3d');
  });

  it('cai para a data a partir de uma semana', () => {
    expect(relativeTime('2026-08-10T10:00:00Z', now)).toBe('10/08');
  });

  it('devolve string vazia para data inválida', () => {
    expect(relativeTime('não é data', now)).toBe('');
  });
});
