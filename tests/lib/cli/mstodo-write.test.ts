import { describe, expect, it } from 'vitest';
import { buildEditArgs } from '@/lib/cli/mstodo';

describe('buildEditArgs', () => {
  it('inclui só os campos informados', () => {
    expect(buildEditArgs('T1', { title: 'Novo título' })).toEqual(['T1', '--title', 'Novo título']);
  });

  it('monta todos os campos quando presentes', () => {
    expect(
      buildEditArgs('T1', { due: '2026-08-30', time: '14:00', recur: 'weekly', priority: 'high' }),
    ).toEqual(['T1', '--due', '2026-08-30', '--time', '14:00', '--recur', 'weekly', '--priority', 'high']);
  });

  it('aceita "none" para limpar data/hora/repetição', () => {
    expect(buildEditArgs('T1', { due: 'none', time: 'none', recur: 'none' })).toEqual([
      'T1', '--due', 'none', '--time', 'none', '--recur', 'none',
    ]);
  });

  it('sem campos extras devolve só o id', () => {
    expect(buildEditArgs('T1', {})).toEqual(['T1']);
  });
});
