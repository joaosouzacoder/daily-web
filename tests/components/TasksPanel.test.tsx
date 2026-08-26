import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TasksPanel, formatDue } from '@/components/TasksPanel';
import type { TodoTask } from '@/lib/types';

function task(over: Partial<TodoTask>): TodoTask {
  return {
    id: '1',
    title: 'Tarefa',
    completed: false,
    due: '',
    priority: 'normal',
    time: '',
    recur: '',
    notes: '',
    subtasks: [],
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('formatDue', () => {
  it('mostra dia/mês sem o ano', () => {
    expect(formatDue('2026-08-11', '')).toBe('11/08');
  });

  it('acrescenta a hora quando existe', () => {
    expect(formatDue('2026-08-11', '14:00')).toBe('11/08 14:00');
  });

  it('devolve o valor original quando não é uma data reconhecível', () => {
    expect(formatDue('sem data', '')).toBe('sem data');
  });
});

describe('TasksPanel', () => {
  it('lista as tarefas agrupadas por faixa de prazo', () => {
    render(
      <TasksPanel
        onCompletedChanged={() => {}}
        onRemoved={() => {}}
        onSubtaskChanged={() => {}}
        tasks={{ data: [task({ id: '1', title: 'Tarefa solta' })], error: null }}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText('Tarefa solta')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'SEM DATA' })).toBeInTheDocument();
  });

  it('filtra por busca textual', () => {
    render(
      <TasksPanel
        onCompletedChanged={() => {}}
        onRemoved={() => {}}
        onSubtaskChanged={() => {}}
        tasks={{
          data: [task({ id: '1', title: 'Comprar pão' }), task({ id: '2', title: 'Revisar PR' })],
          error: null,
        }}
        onChanged={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('buscar tarefas'), { target: { value: 'pão' } });
    expect(screen.getByText('Comprar pão')).toBeInTheDocument();
    expect(screen.queryByText('Revisar PR')).toBeNull();
  });

  it('filtra por prioridade alta', () => {
    render(
      <TasksPanel
        onCompletedChanged={() => {}}
        onRemoved={() => {}}
        onSubtaskChanged={() => {}}
        tasks={{
          data: [
            task({ id: '1', title: 'Urgente', priority: 'high' }),
            task({ id: '2', title: 'Comum' }),
          ],
          error: null,
        }}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Alta' }));
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.queryByText('Comum')).toBeNull();
  });

  it('conclui uma tarefa e avisa onChanged', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const onChanged = vi.fn();
    render(<TasksPanel onCompletedChanged={() => {}} onRemoved={() => {}} onSubtaskChanged={() => {}} tasks={{ data: [task({})], error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText('concluir Tarefa'));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/tasks/1',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  // Ao falhar, a marcação otimista precisa ser desfeita — e a fonte da
  // verdade é o servidor, então recarregar é justamente o certo a fazer.
  it('mostra o erro e recarrega para desfazer quando concluir falha', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ error: 'mstodo falhou' }), { status: 502 }),
    );
    const onChanged = vi.fn();
    const onCompletedChanged = vi.fn();
    render(
      <TasksPanel
        onCompletedChanged={onCompletedChanged}
        onRemoved={() => {}}
        onSubtaskChanged={() => {}}
        tasks={{ data: [task({})], error: null }}
        onChanged={onChanged}
      />,
    );
    fireEvent.click(screen.getByLabelText('concluir Tarefa'));

    // A tela reage antes da resposta.
    expect(onCompletedChanged).toHaveBeenCalledWith('1', true);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('mstodo falhou'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('conclui na tela antes de o servidor responder', () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
    const onCompletedChanged = vi.fn();
    render(
      <TasksPanel
        onCompletedChanged={onCompletedChanged}
        onRemoved={() => {}}
        onSubtaskChanged={() => {}}
        tasks={{ data: [task({})], error: null }}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('concluir Tarefa'));
    expect(onCompletedChanged).toHaveBeenCalledWith('1', true);
  });

  // Recorrente não vira "feita": ela pula para a próxima data. Antecipar o
  // risco seria mostrar um estado que o servidor vai desmentir.
  it('não antecipa a conclusão de uma tarefa que repete', () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
    const onCompletedChanged = vi.fn();
    render(
      <TasksPanel
        onCompletedChanged={onCompletedChanged}
        onRemoved={() => {}}
        onSubtaskChanged={() => {}}
        tasks={{ data: [task({ recur: 'weekly' })], error: null }}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('concluir Tarefa'));
    expect(onCompletedChanged).not.toHaveBeenCalled();
  });

  it('marca uma subtarefa pela API certa', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    render(
      <TasksPanel
        onCompletedChanged={() => {}}
        onRemoved={() => {}}
        onSubtaskChanged={() => {}}
        tasks={{
          data: [task({ subtasks: [{ id: 's1', title: 'Etapa', completed: false }] })],
          error: null,
        }}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'expandir subtarefas de Tarefa' }));
    fireEvent.click(screen.getByLabelText('concluir subtarefa Etapa'));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/tasks/1/subtasks/s1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ completed: true }) }),
      ),
    );
  });

  it('o campo de subtarefa só aparece depois de clicar no +', () => {
    render(<TasksPanel onCompletedChanged={() => {}} onRemoved={() => {}} onSubtaskChanged={() => {}} tasks={{ data: [task({})], error: null }} onChanged={() => {}} />);
    expect(screen.queryByLabelText('nova subtarefa de Tarefa')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'adicionar subtarefa em Tarefa' }));
    expect(screen.getByLabelText('nova subtarefa de Tarefa')).toBeInTheDocument();
  });

  it('adiciona uma subtarefa pela API certa', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    render(<TasksPanel onCompletedChanged={() => {}} onRemoved={() => {}} onSubtaskChanged={() => {}} tasks={{ data: [task({})], error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'adicionar subtarefa em Tarefa' }));
    fireEvent.change(screen.getByLabelText('nova subtarefa de Tarefa'), {
      target: { value: 'Etapa nova' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/tasks/1/subtasks',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Etapa nova' }) }),
      ),
    );
  });

  it('esconde tarefas concluídas por padrão', () => {
    render(
      <TasksPanel
        onCompletedChanged={() => {}}
        onRemoved={() => {}}
        onSubtaskChanged={() => {}}
        tasks={{
          data: [
            task({ id: '1', title: 'Pendente' }),
            task({ id: '2', title: 'Já feita', completed: true }),
          ],
          error: null,
        }}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.queryByText('Já feita')).toBeNull();
  });

  it('mostra as concluídas quando o filtro é ligado', () => {
    render(
      <TasksPanel
        onCompletedChanged={() => {}}
        onRemoved={() => {}}
        onSubtaskChanged={() => {}}
        tasks={{
          data: [
            task({ id: '1', title: 'Pendente' }),
            task({ id: '2', title: 'Já feita', completed: true }),
          ],
          error: null,
        }}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Concluídas' }));
    expect(screen.getByText('Já feita')).toBeInTheDocument();
  });

  it('mantém as subtarefas escondidas até clicarem na seta', () => {
    render(
      <TasksPanel
        onCompletedChanged={() => {}}
        onRemoved={() => {}}
        onSubtaskChanged={() => {}}
        tasks={{
          data: [task({ subtasks: [{ id: 's1', title: 'Etapa', completed: false }] })],
          error: null,
        }}
        onChanged={() => {}}
      />,
    );
    expect(screen.queryByText('Etapa')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'expandir subtarefas de Tarefa' }));
    expect(screen.getByText('Etapa')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'recolher subtarefas de Tarefa' }));
    expect(screen.queryByText('Etapa')).toBeNull();
  });

  // O contador mantém a subtarefa visível como informação mesmo recolhida:
  // dá para saber que existe e quanto falta sem abrir.
  it('mostra o quanto das subtarefas já foi feito mesmo recolhido', () => {
    render(
      <TasksPanel
        onCompletedChanged={() => {}}
        onRemoved={() => {}}
        onSubtaskChanged={() => {}}
        tasks={{
          data: [
            task({
              subtasks: [
                { id: 's1', title: 'Etapa', completed: true },
                { id: 's2', title: 'Outra', completed: false },
              ],
            }),
          ],
          error: null,
        }}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByTitle('subtarefas concluídas').textContent).toBe('1/2');
  });

  it('não oferece seta em tarefa sem subtarefa', () => {
    render(<TasksPanel onCompletedChanged={() => {}} onRemoved={() => {}} onSubtaskChanged={() => {}} tasks={{ data: [task({})], error: null }} onChanged={() => {}} />);
    expect(screen.queryByRole('button', { name: /subtarefas de Tarefa/ })).toBeNull();
  });

  // Quem clica no "+" quer ver o campo — e o que já existe ali junto.
  it('o + abre o campo e revela as subtarefas existentes', () => {
    render(
      <TasksPanel
        onCompletedChanged={() => {}}
        onRemoved={() => {}}
        onSubtaskChanged={() => {}}
        tasks={{
          data: [task({ subtasks: [{ id: 's1', title: 'Etapa', completed: false }] })],
          error: null,
        }}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'adicionar subtarefa em Tarefa' }));
    expect(screen.getByLabelText('nova subtarefa de Tarefa')).toBeInTheDocument();
    expect(screen.getByText('Etapa')).toBeInTheDocument();
  });

  it('mostra o estado vazio quando não há tarefas', () => {
    render(<TasksPanel onCompletedChanged={() => {}} onRemoved={() => {}} onSubtaskChanged={() => {}} tasks={{ data: [], error: null }} onChanged={() => {}} />);
    expect(screen.getByText(/nenhuma tarefa/i)).toBeInTheDocument();
  });
});
