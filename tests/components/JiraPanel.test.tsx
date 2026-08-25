import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { JiraPanel } from '@/components/JiraPanel';
import type { JiraItem } from '@/lib/types';

afterEach(cleanup);

const issues: JiraItem[] = [
  { key: 'A-1', summary: 'Bug', status: '', project: 'A', url: 'https://x/A-1', parent: null, role: 'reporter', kind: 'Bug', subtask: false },
  { key: 'A-2', summary: 'Feature', status: '', project: 'A', url: 'https://x/A-2', parent: null, role: 'both', kind: 'História', subtask: false },
];

describe('JiraPanel', () => {
  it('mostra REL para quem só relatou e RES para quem é responsável, no filtro ambas', () => {
    render(<JiraPanel jira={{ data: issues, error: null }} />);
    expect(screen.getByText('REL')).toBeInTheDocument();
    expect(screen.getByText('RES')).toBeInTheDocument();
  });

  it('ciclar o filtro (ambas -> minhas) esconde o marcador de papel', () => {
    render(<JiraPanel jira={{ data: issues, error: null }} />);
    fireEvent.click(screen.getByText(/filtro: ambas/));
    expect(screen.getByText(/filtro: minhas/)).toBeInTheDocument();
    expect(screen.queryByText('REL')).toBeNull();
  });

  it('agrupar por pai mostra o resumo do pai como cabeçalho', () => {
    const withParent: JiraItem[] = [
      { key: 'B-1', summary: 'Filha', status: '', project: 'B', url: 'https://x/B-1', parent: { key: 'B-0', summary: 'Épico mãe' }, role: 'assignee', kind: 'História', subtask: false },
    ];
    render(<JiraPanel jira={{ data: withParent, error: null }} />);
    fireEvent.click(screen.getByText('agrupar por pai'));
    expect(screen.getByText('Épico mãe')).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<JiraPanel jira={{ data: [], error: 'jira falhou: JIRA_TOKEN ausente' }} />);
    expect(screen.getByRole('alert').textContent).toContain('JIRA_TOKEN');
  });
});
