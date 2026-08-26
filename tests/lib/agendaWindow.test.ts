import { describe, expect, it } from 'vitest';
import {
  AGENDA_RANGES,
  DEFAULT_AGENDA_DAYS,
  agendaRange,
  computeAgendaWindow,
  isAgendaRange,
} from '@/lib/agendaWindow';

const QUARTA = new Date('2026-08-26T10:00:00');

describe('computeAgendaWindow', () => {
  // `days` conta a partir de hoje, incluindo hoje. Antes a janela era fixa em
  // `hoje + 7`, que na prática mostrava oito dias.
  it('com 1 dia, começa e termina hoje', () => {
    expect(computeAgendaWindow(QUARTA, 1)).toEqual({
      start: '2026-08-26',
      end: '2026-08-26',
    });
  });

  it('com 2 dias, vai até amanhã', () => {
    expect(computeAgendaWindow(QUARTA, 2)).toEqual({
      start: '2026-08-26',
      end: '2026-08-27',
    });
  });

  it('com 7 dias, cobre sete dias, não oito', () => {
    expect(computeAgendaWindow(QUARTA, 7)).toEqual({
      start: '2026-08-26',
      end: '2026-09-01',
    });
  });

  it('atravessa a virada do mês', () => {
    expect(computeAgendaWindow(new Date('2026-08-30T10:00:00'), 3).end).toBe('2026-09-01');
  });

  it('usa o padrão quando o período não é informado', () => {
    expect(computeAgendaWindow(QUARTA)).toEqual(computeAgendaWindow(QUARTA, DEFAULT_AGENDA_DAYS));
  });

  it('nunca produz janela menor que um dia', () => {
    expect(computeAgendaWindow(QUARTA, 0).end).toBe('2026-08-26');
    expect(computeAgendaWindow(QUARTA, -5).end).toBe('2026-08-26');
  });
});

describe('isAgendaRange', () => {
  it('aceita só os períodos oferecidos na tela', () => {
    expect(isAgendaRange(1)).toBe(true);
    expect(isAgendaRange(7)).toBe(true);
    expect(isAgendaRange(5)).toBe(false);
    expect(isAgendaRange(365)).toBe(false);
    expect(isAgendaRange('7')).toBe(false);
    expect(isAgendaRange(null)).toBe(false);
  });
});

describe('agendaRange', () => {
  it('devolve o rótulo do período', () => {
    expect(agendaRange(1).label).toBe('Hoje');
    expect(agendaRange(1).emptyLabel).toBe('para hoje');
  });

  it('cai no padrão para valor desconhecido', () => {
    expect(agendaRange(99).days).toBe(DEFAULT_AGENDA_DAYS);
  });

  it('o padrão está entre as opções oferecidas', () => {
    expect(AGENDA_RANGES.some((r) => r.days === DEFAULT_AGENDA_DAYS)).toBe(true);
  });
});
