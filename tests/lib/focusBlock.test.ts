import { describe, expect, it } from 'vitest';
import { defaultStart, parseFocusSource } from '@/lib/focusBlock';

describe('parseFocusSource', () => {
  it('aceita uma origem válida', () => {
    expect(parseFocusSource(JSON.stringify({ kind: 'jira', ref: 'DEV-1', title: 'Corrigir', url: 'https://jira.exemplo/DEV-1' }))).toEqual({
      kind: 'jira', ref: 'DEV-1', title: 'Corrigir', url: 'https://jira.exemplo/DEV-1',
    });
  });

  it('recusa lixo e campos grandes demais', () => {
    expect(parseFocusSource('{')).toBeNull();
    expect(parseFocusSource(JSON.stringify({ kind: 'outro', ref: '', title: 'X' }))).toBeNull();
    expect(parseFocusSource(JSON.stringify({ kind: 'task', ref: 'x'.repeat(65), title: 'X' }))).toBeNull();
    expect(parseFocusSource(JSON.stringify({ kind: 'task', ref: '1', title: 'x'.repeat(201) }))).toBeNull();
    expect(parseFocusSource(JSON.stringify({ kind: 'pull', ref: '1', title: 'X', url: 'http://exemplo.com' }))).toBeNull();
  });
});

describe('defaultStart', () => {
  it.each([
    ['2026-09-21T10:07:00', '2026-09-21T10:30:00'],
    ['2026-09-21T10:25:00', '2026-09-21T11:00:00'],
    ['2026-09-21T20:10:00', '2026-09-22T09:00:00'],
  ])('arredonda %s para %s', (input, expected) => {
    expect(defaultStart(new Date(input))).toEqual(new Date(expected));
  });
});
