import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseAgendaTsv, computeAgendaWindow } from '@/lib/parsers/gcalcli';

const fixture = readFileSync(path.join(__dirname, '../../fixtures/gcalcli-agenda.tsv'), 'utf8');

describe('parseAgendaTsv', () => {
  it('descarta a linha de cabeçalho', () => {
    expect(parseAgendaTsv(fixture, 'work')).toHaveLength(2);
  });

  it('reconhece evento com horário', () => {
    const items = parseAgendaTsv(fixture, 'work');
    expect(items[0]).toEqual({ account: 'work', date: '2026-08-26', time: '14:00', title: 'Daily' });
  });

  it('reconhece evento de dia inteiro (sem horário)', () => {
    const items = parseAgendaTsv(fixture, 'personal');
    expect(items[1].time).toBe('');
    expect(items[1].title).toBe('Feriado');
  });

  it('ignora linhas em branco', () => {
    expect(parseAgendaTsv('', 'work')).toEqual([]);
  });
});

describe('computeAgendaWindow', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Sao_Paulo';
  });

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('começa na data LOCAL de "now", não na data UTC (23:30 em São Paulo já é dia seguinte em UTC)', () => {
    const lateLocalNow = new Date('2026-08-25T23:30:00-03:00');
    expect(computeAgendaWindow(lateLocalNow).start).toBe('2026-08-25');
  });

  it('termina 7 dias depois da data local de início', () => {
    const now = new Date('2026-08-25T12:00:00-03:00');
    expect(computeAgendaWindow(now)).toEqual({ start: '2026-08-25', end: '2026-09-01' });
  });
});
