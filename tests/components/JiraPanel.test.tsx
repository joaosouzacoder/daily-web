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
    fireEvent.click(screen.getByRole('button', { name: 'Minhas' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Relator' }));
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

  it('separa os projetos em blocos próprios na hierarquia', () => {
    render(
      <JiraPanel
        jira={{
          data: [
            issue({ key: 'PDS-1', project: 'PDS', summary: 'Chamado' }),
            issue({ key: 'TT-1', project: 'TT', summary: 'História' }),
          ],
          error: null,
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: /PDS/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /TT/ })).toBeInTheDocument();
  });

  it('aninha a filha sob a mãe quando as duas estão na lista', () => {
    render(
      <JiraPanel
        jira={{
          data: [
            issue({ key: 'TT-1', project: 'TT', summary: 'Épico mãe' }),
            issue({
              key: 'TT-9',
              project: 'TT',
              summary: 'História filha',
              parent: { key: 'TT-1', summary: 'Épico mãe' },
            }),
          ],
          error: null,
        }}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    // A mãe vem primeiro e a filha logo abaixo, recuada.
    expect(rows[0].textContent).toContain('TT-1');
    expect(rows[1].textContent).toContain('TT-9');
    expect(rows[1].getAttribute('style')).toContain('padding-left');
  });

  it('alterna para lista simples quando pedido', () => {
    render(
      <JiraPanel
        jira={{ data: [issue({ key: 'TT-1', project: 'TT' })], error: null }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hierarquia' }));
    expect(screen.queryByRole('heading', { name: /TT/ })).toBeNull();
    expect(screen.getByText('TT-1')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Minhas' }));
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<JiraPanel jira={{ data: null, error: 'jira falhou' }} />);
    expect(screen.getByRole('alert').textContent).toContain('jira falhou');
  });
});
