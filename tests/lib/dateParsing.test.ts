import { describe, expect, it } from 'vitest';
import { parseDueInput } from '@/lib/dateParsing';

describe('parseDueInput', () => {
  const now = new Date('2026-08-25T12:00:00Z');

  it('vazio limpa a data e a hora', () => {
    expect(parseDueInput('', now)).toEqual({ due: 'none', time: 'none' });
  });

  it('interpreta "hoje"', () => {
    expect(parseDueInput('hoje', now)).toEqual({ due: '2026-08-25', time: 'none' });
  });

  it('interpreta "amanhã" com e sem acento', () => {
    expect(parseDueInput('amanhã', now).due).toBe('2026-08-26');
    expect(parseDueInput('amanha', now).due).toBe('2026-08-26');
  });

  it('interpreta "+3d"', () => {
    expect(parseDueInput('+3d', now).due).toBe('2026-08-28');
  });

  it('aceita AAAA-MM-DD', () => {
    expect(parseDueInput('2026-09-01', now).due).toBe('2026-09-01');
  });

  it('aceita hora opcional no fim', () => {
    expect(parseDueInput('hoje 14:30', now)).toEqual({ due: '2026-08-25', time: '14:30' });
    expect(parseDueInput('2026-08-20 09:00', now)).toEqual({ due: '2026-08-20', time: '09:00' });
  });

  it('rejeita data que não parseia', () => {
    expect(() => parseDueInput('32/13', now)).toThrow('data inválida');
  });

  it('rejeita data calendário-inválida', () => {
    expect(() => parseDueInput('2026-02-30', now)).toThrow('data inválida');
  });

  it('rejeita hora que não parseia', () => {
    expect(() => parseDueInput('hoje 25:00', now)).toThrow('hora inválida');
  });
});
