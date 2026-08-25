import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseAgendaTsv } from '@/lib/parsers/gcalcli';

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
