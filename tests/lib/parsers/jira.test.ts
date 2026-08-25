import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseIssues, typeMarker, issueMarker, groupByParent, buildJiraTree } from '@/lib/parsers/jira';
import type { JiraItem } from '@/lib/types';

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

describe('buildJiraTree', () => {
  function item(over: Partial<JiraItem>): JiraItem {
    return {
      key: 'A-1',
      summary: 'Resumo',
      status: 'Aberto',
      project: 'A',
      url: 'u',
      parent: null,
      role: 'assignee',
      kind: 'História',
      subtask: false,
      ...over,
    };
  }

  it('separa cada projeto em seu próprio grupo, em ordem alfabética', () => {
    const groups = buildJiraTree([
      item({ key: 'TT-1', project: 'TT' }),
      item({ key: 'PDS-1', project: 'PDS' }),
    ]);
    expect(groups.map((g) => g.project)).toEqual(['PDS', 'TT']);
  });

  it('aninha a filha sob a mãe quando as duas estão na lista', () => {
    const groups = buildJiraTree([
      item({ key: 'TT-1', project: 'TT' }),
      item({ key: 'TT-9', project: 'TT', parent: { key: 'TT-1', summary: 'mãe' } }),
    ]);
    expect(groups[0].roots).toHaveLength(1);
    expect(groups[0].roots[0].issue.key).toBe('TT-1');
    expect(groups[0].roots[0].children[0].issue.key).toBe('TT-9');
  });

  it('trata como raiz a issue cuja mãe não está na lista', () => {
    const groups = buildJiraTree([
      item({ key: 'TT-9', project: 'TT', parent: { key: 'TT-1', summary: 'ausente' } }),
    ]);
    expect(groups[0].roots).toHaveLength(1);
    expect(groups[0].roots[0].issue.key).toBe('TT-9');
  });

  it('conta a árvore inteira, não só as raízes', () => {
    const groups = buildJiraTree([
      item({ key: 'TT-1', project: 'TT' }),
      item({ key: 'TT-9', project: 'TT', parent: { key: 'TT-1', summary: 'mãe' } }),
      item({ key: 'TT-10', project: 'TT', parent: { key: 'TT-9', summary: 'filha' } }),
    ]);
    expect(groups[0].count).toBe(3);
  });

  it('ignora uma issue que aponta para si mesma como mãe', () => {
    const groups = buildJiraTree([
      item({ key: 'TT-1', project: 'TT', parent: { key: 'TT-1', summary: 'ela mesma' } }),
    ]);
    expect(groups[0].roots[0].issue.key).toBe('TT-1');
    expect(groups[0].roots[0].children).toHaveLength(0);
  });
});
