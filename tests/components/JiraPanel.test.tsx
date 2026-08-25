import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { JiraPanel } from '@/components/JiraPanel';
import type { JiraItem } from '@/lib/types';

function issue(over: Partial<JiraItem>): JiraItem {
  return {
    key: 'A-1',
    summary: 'Resumo',
    status: 'Aberto',
    project: 'A',
    url: 'https://example/A-1',
    parent: null,
    role: 'assignee',
    kind: 'História',
    subtask: false,
    ...over,
  };
}

afterEach(cleanup);

describe('JiraPanel', () => {
  it('lista as issues com chave e resumo', () => {
    render(<JiraPanel jira={{ data: [issue({})], error: null }} />);
    expect(screen.getByText('A-1')).toBeInTheDocument();
    expect(screen.getByText('Resumo')).toBeInTheDocument();
  });

  it('mostra issues com papel both no filtro minhas', () => {
    render(
      <JiraPanel
        jira={{
          data: [issue({ key: 'A-1', role: 'reporter' }), issue({ key: 'A-2', role: 'both' })],
          error: null,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'minhas' }));
    expect(screen.getByText('A-2')).toBeInTheDocument();
    expect(screen.queryByText('A-1')).toBeNull();
  });

  it('mostra issues com papel both no filtro relator', () => {
    render(
      <JiraPanel
        jira={{
          data: [issue({ key: 'A-1', role: 'assignee' }), issue({ key: 'A-2', role: 'both' })],
          error: null,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'relator' }));
    expect(screen.getByText('A-2')).toBeInTheDocument();
    expect(screen.queryByText('A-1')).toBeNull();
  });

  it('filtra por busca textual', () => {
    render(
      <JiraPanel
        jira={{
          data: [
            issue({ key: 'A-1', summary: 'Corrigir login' }),
            issue({ key: 'A-2', summary: 'Ajustar deploy' }),
          ],
          error: null,
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText('buscar issues'), { target: { value: 'login' } });
    expect(screen.getByText('A-1')).toBeInTheDocument();
    expect(screen.queryByText('A-2')).toBeNull();
  });

  it('agrupa por pai quando solicitado', () => {
    render(
      <JiraPanel
        jira={{
          data: [issue({ key: 'A-9', parent: { key: 'A-1', summary: 'Épico pai' } })],
          error: null,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'agrupar por pai' }));
    expect(screen.getByText('Épico pai')).toBeInTheDocument();
  });

  it('mostra o contador quando um filtro está ativo', () => {
    render(
      <JiraPanel
        jira={{
          data: [issue({ key: 'A-1', role: 'assignee' }), issue({ key: 'A-2', role: 'reporter' })],
          error: null,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'minhas' }));
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<JiraPanel jira={{ data: null, error: 'jira falhou' }} />);
    expect(screen.getByRole('alert').textContent).toContain('jira falhou');
  });
});
