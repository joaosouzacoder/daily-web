import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { JiraPanel } from '@/components/JiraPanel';
import type { JiraItem } from '@/lib/types';

function issue(over: Partial<JiraItem>): JiraItem {
  return {
    key: 'A-1',
    summary: 'Resumo',
    status: 'Aberto',
    statusCategory: 'new',
    project: 'A',
    url: 'https://example/A-1',
    parent: null,
    role: 'assignee',
    kind: 'História',
    subtask: false,
    updatedAt: new Date().toISOString(),
    dueDate: '',
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

  // Fora da hierarquia, o agrupamento passou a ser por situação. Agrupar por
  // projeto quase não agrupava: 16 das 19 issues reais são do mesmo projeto.
  it('na lista simples, agrupa por situação em vez de projeto', () => {
    render(
      <JiraPanel
        jira={{
          data: [
            issue({ key: 'TT-1', project: 'TT', statusCategory: 'indeterminate', status: 'Em andamento' }),
            issue({ key: 'TT-2', project: 'TT', statusCategory: 'new', status: 'Backlog' }),
          ],
          error: null,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hierarquia' }));

    expect(screen.queryByRole('heading', { name: /^TT/ })).toBeNull();
    expect(screen.getByRole('heading', { name: /Em andamento/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Pendentes/ })).toBeInTheDocument();
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

describe('situação, idade e prazo na linha', () => {
  // O selo antigo mostrava o papel, que em 15 de 19 issues dizia a mesma
  // coisa. O status tem cinco valores distintos e é o que faltava.
  it('mostra o status em vez do papel padrão', () => {
    render(<JiraPanel jira={{ data: [issue({ status: 'Freezing' })], error: null }} />);
    expect(screen.getByText('Freezing')).toBeInTheDocument();
    expect(screen.queryByText('RES')).toBeNull();
  });

  it('ainda marca quando você é só o relator, que é a exceção', () => {
    render(<JiraPanel jira={{ data: [issue({ role: 'reporter' })], error: null }} />);
    expect(screen.getByText('REL')).toBeInTheDocument();
  });

  it('junta o mesmo status escrito com caixas diferentes', () => {
    render(
      <JiraPanel
        jira={{
          data: [
            issue({ key: 'A-1', status: 'Em andamento', statusCategory: 'indeterminate' }),
            issue({ key: 'A-2', status: 'Em Andamento', statusCategory: 'indeterminate' }),
          ],
          error: null,
        }}
      />,
    );
    expect(screen.getAllByText('Em andamento')).toHaveLength(2);
  });

  function diasAtras(dias: number): string {
    return new Date(Date.now() - dias * 86400000).toISOString();
  }

  it('avisa o que está parado há tempo demais', () => {
    render(<JiraPanel jira={{ data: [issue({ updatedAt: diasAtras(14) })], error: null }} />);
    expect(screen.getByText('parado há 14d')).toBeInTheDocument();
  });

  // Quase tudo é mexido a cada dois dias; avisar sempre apagaria o sinal.
  it('cala sobre o que foi mexido há pouco', () => {
    render(<JiraPanel jira={{ data: [issue({ updatedAt: diasAtras(1) })], error: null }} />);
    expect(screen.queryByText(/parado há/)).toBeNull();
  });

  it('mostra o prazo e destaca o atraso', () => {
    const ontem = new Date(Date.now() - 86400000);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    render(<JiraPanel jira={{ data: [issue({ dueDate: iso(ontem) })], error: null }} />);
    const prazo = screen.getByText('venceu há 1d');
    expect(prazo).toBeInTheDocument();
    expect(prazo.className).toContain('is-overdue');
  });

  it('não inventa prazo para issue sem data', () => {
    render(<JiraPanel jira={{ data: [issue({ dueDate: '' })], error: null }} />);
    expect(screen.queryByText(/vence/)).toBeNull();
  });
});
