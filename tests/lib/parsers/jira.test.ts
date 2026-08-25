import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseIssues, typeMarker, issueMarker, groupByParent } from '@/lib/parsers/jira';

const real = readFileSync(path.join(__dirname, '../../fixtures/jira-issues.json'), 'utf8');
const tree = readFileSync(path.join(__dirname, '../../fixtures/jira-issues-tree.json'), 'utf8');

describe('parseIssues', () => {
  it('faz o parse do contrato real do helper jira', () => {
    const items = parseIssues(real);
    expect(items).toHaveLength(3);
    expect(items[0].key).toBe('ENG-101');
    expect(items[0].status).toBe('Em andamento');
    expect(items[0].parent).toEqual({ key: 'ENG-1', summary: 'Iniciativa de Engenharia' });
    expect(items[1].parent).toBeNull();
  });

  it('usa "assignee" como role padrão quando ausente', () => {
    const items = parseIssues(real);
    expect(items[0].role).toBe('assignee');
  });
});

describe('typeMarker', () => {
  it('reconhece o tipo nos dois idiomas', () => {
    expect(typeMarker('História')).toBe('[S]');
    expect(typeMarker('Story')).toBe('[S]');
    expect(typeMarker('Epic')).toBe('[E]');
    expect(typeMarker('Épico')).toBe('[E]');
    expect(typeMarker('Iniciativa')).toBe('[I]');
    expect(typeMarker('Objetivo')).toBe('[O]');
  });

  it('reconhece requisição de serviço em várias formas', () => {
    expect(typeMarker('[System] Service request')).toBe('[R]');
    expect(typeMarker('Requisição')).toBe('[R]');
  });

  it('devolve [?] para tipo desconhecido', () => {
    expect(typeMarker('Subtarefa')).toBe('[?]');
    expect(typeMarker('')).toBe('[?]');
  });
});

describe('issueMarker', () => {
  it('usa [s] para subtarefa mesmo quando o nome do tipo não é reconhecido', () => {
    const items = parseIssues(tree);
    const subtask = items.find((i) => i.key === 'ENG-9')!;
    expect(typeMarker(subtask.kind)).toBe('[?]');
    expect(issueMarker(subtask)).toBe('[s]');
  });

  it('história segue com o marcador do tipo', () => {
    const items = parseIssues(tree);
    const story = items.find((i) => i.key === 'ENG-7')!;
    expect(issueMarker(story)).toBe('[S]');
  });
});

describe('groupByParent', () => {
  it('agrupa issues pelo pai e junta as sem pai em "sem pai"', () => {
    const groups = groupByParent(parseIssues(real));
    const withParent = groups.find((g) => g.parentKey === 'ENG-1');
    expect(withParent?.issues.map((i) => i.key)).toEqual(['ENG-101']);
    const orphanGroup = groups.find((g) => g.parentKey === null);
    expect(orphanGroup?.issues.map((i) => i.key).sort()).toEqual(['OPS-55', 'OPS-56']);
  });
});
