import { describe, expect, it, afterEach, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { JiraPanel } from '@/components/JiraPanel';
import type { JiraItem } from '@/lib/types';

/** As três listas do painel são obrigatórias; cada teste só quer falar de
 *  uma delas, então o resto vem vazio por padrão. */
function Panel(props: Partial<ComponentProps<typeof JiraPanel>>) {
  return (
    <JiraPanel
      jira={{ data: [], error: null }}
      watched={{ data: [], error: null }}
      delivered={{ data: [], error: null }}
      onChanged={() => {}}
      {...props}
    />
  );
}

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('JiraPanel', () => {
  it('lista as issues com chave e resumo', () => {
    render(<Panel watched={{ data: [], error: null }} onChanged={() => {}} jira={{ data: [issue({})], error: null }} />);
    expect(screen.getByText('A-1')).toBeInTheDocument();
    expect(screen.getByText('Resumo')).toBeInTheDocument();
  });

  it('mostra issues com papel both no filtro minhas', () => {
    render(
      <Panel
        watched={{ data: [], error: null }}
        onChanged={() => {}}
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
      <Panel
        watched={{ data: [], error: null }}
        onChanged={() => {}}
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
      <Panel
        watched={{ data: [], error: null }}
        onChanged={() => {}}
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
      <Panel
        watched={{ data: [], error: null }}
        onChanged={() => {}}
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
      <Panel
        watched={{ data: [], error: null }}
        onChanged={() => {}}
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
    // O ramo começa fechado; a seta é que revela a filha.
    fireEvent.click(screen.getByLabelText(/expandir a issue sob TT-1/));

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
      <Panel
        watched={{ data: [], error: null }}
        onChanged={() => {}}
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
      <Panel
        watched={{ data: [], error: null }}
        onChanged={() => {}}
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
    render(<Panel watched={{ data: [], error: null }} onChanged={() => {}} jira={{ data: null, error: 'jira falhou' }} />);
    expect(screen.getByRole('alert').textContent).toContain('jira falhou');
  });
});

describe('situação, idade e prazo na linha', () => {
  // O selo antigo mostrava o papel, que em 15 de 19 issues dizia a mesma
  // coisa. O status tem cinco valores distintos e é o que faltava.
  it('mostra o status em vez do papel padrão', () => {
    render(<Panel watched={{ data: [], error: null }} onChanged={() => {}} jira={{ data: [issue({ status: 'Freezing' })], error: null }} />);
    expect(screen.getByText('Freezing')).toBeInTheDocument();
    expect(screen.queryByText('RES')).toBeNull();
  });

  it('ainda marca quando você é só o relator, que é a exceção', () => {
    render(<Panel watched={{ data: [], error: null }} onChanged={() => {}} jira={{ data: [issue({ role: 'reporter' })], error: null }} />);
    expect(screen.getByText('REL')).toBeInTheDocument();
  });

  it('junta o mesmo status escrito com caixas diferentes', () => {
    render(
      <Panel
        watched={{ data: [], error: null }}
        onChanged={() => {}}
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
    render(<Panel watched={{ data: [], error: null }} onChanged={() => {}} jira={{ data: [issue({ updatedAt: diasAtras(14) })], error: null }} />);
    expect(screen.getByText('parado há 14d')).toBeInTheDocument();
  });

  // Quase tudo é mexido a cada dois dias; avisar sempre apagaria o sinal.
  it('cala sobre o que foi mexido há pouco', () => {
    render(<Panel watched={{ data: [], error: null }} onChanged={() => {}} jira={{ data: [issue({ updatedAt: diasAtras(1) })], error: null }} />);
    expect(screen.queryByText(/parado há/)).toBeNull();
  });

  it('mostra o prazo e destaca o atraso', () => {
    const ontem = new Date(Date.now() - 86400000);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    render(<Panel watched={{ data: [], error: null }} onChanged={() => {}} jira={{ data: [issue({ dueDate: iso(ontem) })], error: null }} />);
    const prazo = screen.getByText('venceu há 1d');
    expect(prazo).toBeInTheDocument();
    expect(prazo.className).toContain('is-overdue');
  });

  it('não inventa prazo para issue sem data', () => {
    render(<Panel watched={{ data: [], error: null }} onChanged={() => {}} jira={{ data: [issue({ dueDate: '' })], error: null }} />);
    expect(screen.queryByText(/vence/)).toBeNull();
  });
});

describe('acompanhamento otimista', () => {
  const acompanhada: JiraItem = {
    ...issue({}),
    key: 'PDS-1075',
    summary: 'Issue de outro time',
  };

  function montar(onChanged = () => {}) {
    render(
      <Panel
        jira={{ data: [], error: null }}
        watched={{ data: [acompanhada], error: null }}
        onChanged={onChanged}
      />,
    );
  }

  // Remover é decisão local: esperar o onChanged é esperar o Jira responder
  // de novo, segundos para nada.
  it('some da lista assim que o servidor aceita, sem esperar recarregar', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    montar();

    expect(screen.getByText('PDS-1075')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('parar de acompanhar PDS-1075'));

    await waitFor(() => expect(screen.queryByText('PDS-1075')).not.toBeInTheDocument());
    expect(screen.getByText('Nenhuma issue acompanhada.')).toBeInTheDocument();
  });

  it('manda a chave no DELETE', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    montar();

    fireEvent.click(screen.getByLabelText('parar de acompanhar PDS-1075'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/jira/watch');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ key: 'PDS-1075' });
  });

  // Sumir da tela e continuar acompanhando no servidor seria pior do que não
  // sumir: a issue volta na próxima atualização sem explicação.
  it('volta para a lista quando o servidor recusa', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    montar();

    fireEvent.click(screen.getByLabelText('parar de acompanhar PDS-1075'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Falha ao remover/));
    expect(screen.getByText('PDS-1075')).toBeInTheDocument();
  });

  it('recarrega o painel depois de remover', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const onChanged = vi.fn();
    montar(onChanged);

    fireEvent.click(screen.getByLabelText('parar de acompanhar PDS-1075'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});

describe('hierarquia expansível', () => {
  const arvore: JiraItem[] = [
    issue({ key: 'TT-100', summary: 'Iniciativa', project: 'TT', parent: null }),
    issue({ key: 'TT-101', summary: 'Épico', project: 'TT', parent: { key: 'TT-100', summary: 'Iniciativa' } }),
    issue({ key: 'TT-102', summary: 'História', project: 'TT', parent: { key: 'TT-101', summary: 'Épico' } }),
    issue({ key: 'TT-200', summary: 'Solta', project: 'TT', parent: null }),
  ];

  function montar() {
    render(
      <Panel
        jira={{ data: arvore, error: null }}
        watched={{ data: [], error: null }}
        onChanged={() => {}}
      />,
    );
  }

  it('começa fechada, mostrando só o topo', () => {
    montar();
    expect(screen.getByText('TT-100')).toBeInTheDocument();
    expect(screen.getByText('TT-200')).toBeInTheDocument();
    expect(screen.queryByText('TT-101')).toBeNull();
    expect(screen.queryByText('TT-102')).toBeNull();
  });

  it('a seta abre um nível de cada vez', () => {
    montar();
    fireEvent.click(screen.getByLabelText(/expandir a issue sob TT-100/));
    expect(screen.getByText('TT-101')).toBeInTheDocument();
    // O neto continua escondido: abrir a iniciativa não abre o épico.
    expect(screen.queryByText('TT-102')).toBeNull();

    fireEvent.click(screen.getByLabelText(/expandir a issue sob TT-101/));
    expect(screen.getByText('TT-102')).toBeInTheDocument();
  });

  it('a seta fecha de volta', () => {
    montar();
    const seta = () => screen.getByLabelText(/(expandir|recolher) a issue sob TT-100/);
    fireEvent.click(seta());
    expect(screen.getByText('TT-101')).toBeInTheDocument();

    fireEvent.click(seta());
    expect(screen.queryByText('TT-101')).toBeNull();
  });

  it('anuncia o estado para quem usa leitor de tela', () => {
    montar();
    const seta = screen.getByLabelText(/expandir a issue sob TT-100/);
    expect(seta).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(seta);
    expect(screen.getByLabelText(/recolher a issue sob TT-100/)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  // Uma seta que não revela nada é um controle que engana.
  it('a issue sem filha não ganha seta', () => {
    montar();
    expect(screen.queryByLabelText(/sob TT-200/)).toBeNull();
  });

  it('diz quantas issues estão sob a que tem mais de uma', () => {
    render(
      <Panel
        jira={{
          data: [
            issue({ key: 'TT-100', summary: 'Épico', project: 'TT', parent: null }),
            issue({ key: 'TT-101', project: 'TT', parent: { key: 'TT-100', summary: 'Épico' } }),
            issue({ key: 'TT-102', project: 'TT', parent: { key: 'TT-100', summary: 'Épico' } }),
          ],
          error: null,
        }}
        watched={{ data: [], error: null }}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByLabelText('expandir as 2 issues sob TT-100')).toBeInTheDocument();
  });

  // Fora da hierarquia não há pai nem filho para revelar.
  it('a lista por situação não mostra setas', () => {
    montar();
    // O chip diz a visão atual; clicar troca para a lista simples.
    fireEvent.click(screen.getByRole('button', { name: 'Hierarquia' }));
    expect(screen.queryByLabelText(/expandir/)).toBeNull();
    // E ali todas as issues aparecem, porque não há o que colapsar.
    expect(screen.getByText('TT-102')).toBeInTheDocument();
  });
});

// As duas listas não são recortes uma da outra: "Em aberto" é o que ainda
// pede trabalho e "Entregues" é o que saiu hoje.
describe('aba Entregues', () => {
  const entregue = (over: Partial<JiraItem> = {}) =>
    issue({ statusCategory: 'done', status: 'Resolvido', ...over });

  it('abre em "Em aberto" e não mostra as entregues', () => {
    render(
      <Panel
        jira={{ data: [issue({ key: 'TT-1' })], error: null }}
        delivered={{ data: [entregue({ key: 'TT-9' })], error: null }}
      />,
    );
    expect(screen.getByRole('tab', { name: /Em aberto/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('TT-1')).toBeInTheDocument();
    expect(screen.queryByText('TT-9')).toBeNull();
  });

  it('mostra as entregues de hoje ao trocar de aba', () => {
    render(
      <Panel
        jira={{ data: [issue({ key: 'TT-1' })], error: null }}
        delivered={{ data: [entregue({ key: 'TT-9', summary: 'Ajuste do cashback' })], error: null }}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /Entregues/ }));
    expect(screen.getByText('TT-9')).toBeInTheDocument();
    expect(screen.getByText('Ajuste do cashback')).toBeInTheDocument();
    expect(screen.queryByText('TT-1')).toBeNull();
  });

  it('conta as entregues no rótulo da aba', () => {
    render(
      <Panel
        delivered={{ data: [entregue({ key: 'TT-9' }), entregue({ key: 'TT-8' })], error: null }}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Entregues, 2' })).toBeInTheDocument();
  });

  // O status é o que diz de relance que aquilo saiu; verde é a cor de
  // "não pede mais nada de você".
  it('marca o status da entregue como concluída', () => {
    render(<Panel delivered={{ data: [entregue({ key: 'TT-9' })], error: null }} />);
    fireEvent.click(screen.getByRole('tab', { name: /Entregues/ }));
    expect(screen.getByText('Resolvido')).toHaveClass('jira-status-done');
  });

  // Mesma estrutura da outra aba: DAD e PDS não se misturam só porque
  // saíram no mesmo dia.
  it('separa os projetos em blocos e aninha a hierarquia', () => {
    render(
      <Panel
        delivered={{
          data: [
            entregue({ key: 'DAD-1', project: 'DAD', summary: 'Épico mãe' }),
            entregue({
              key: 'DAD-2',
              project: 'DAD',
              summary: 'História filha',
              parent: { key: 'DAD-1', summary: 'Épico mãe' },
            }),
            entregue({ key: 'PDS-1', project: 'PDS', summary: 'Chamado' }),
          ],
          error: null,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /Entregues/ }));

    expect(screen.getByRole('heading', { name: /DAD/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /PDS/ })).toBeInTheDocument();

    // O ramo começa fechado, como na aba de abertas.
    expect(screen.queryByText('DAD-2')).toBeNull();
    fireEvent.click(screen.getByLabelText(/expandir a issue sob DAD-1/));
    expect(screen.getByText('DAD-2')).toBeInTheDocument();
  });

  it('diz quando não houve entrega hoje', () => {
    render(<Panel jira={{ data: [issue({})], error: null }} />);
    fireEvent.click(screen.getByRole('tab', { name: /Entregues/ }));
    expect(screen.getByText('Nenhuma issue entregue hoje.')).toBeInTheDocument();
  });

  it('mostra o erro da busca de entregues sem derrubar a aba', () => {
    render(<Panel delivered={{ data: null, error: 'jira recusou o token' }} />);
    fireEvent.click(screen.getByRole('tab', { name: /Entregues/ }));
    expect(screen.getByRole('alert').textContent).toContain('jira recusou o token');
  });
});
