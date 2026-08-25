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
    render(<TasksPanel tasks={{ data: [task({})], error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText('concluir Tarefa'));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/tasks/1',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('mostra erro e não avisa onChanged quando concluir falha', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ error: 'mstodo falhou' }), { status: 502 }),
    );
    const onChanged = vi.fn();
    render(<TasksPanel tasks={{ data: [task({})], error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText('concluir Tarefa'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('mstodo falhou'));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('marca uma subtarefa pela API certa', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    render(
      <TasksPanel
        tasks={{
          data: [task({ subtasks: [{ id: 's1', title: 'Etapa', completed: false }] })],
          error: null,
        }}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('concluir subtarefa Etapa'));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/tasks/1/subtasks/s1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ completed: true }) }),
      ),
    );
  });

  it('o campo de subtarefa só aparece depois de clicar no +', () => {
    render(<TasksPanel tasks={{ data: [task({})], error: null }} onChanged={() => {}} />);
    expect(screen.queryByLabelText('nova subtarefa de Tarefa')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'adicionar subtarefa em Tarefa' }));
    expect(screen.getByLabelText('nova subtarefa de Tarefa')).toBeInTheDocument();
  });

  it('adiciona uma subtarefa pela API certa', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    render(<TasksPanel tasks={{ data: [task({})], error: null }} onChanged={() => {}} />);
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

  it('mostra o estado vazio quando não há tarefas', () => {
    render(<TasksPanel tasks={{ data: [], error: null }} onChanged={() => {}} />);
    expect(screen.getByText(/nenhuma tarefa/i)).toBeInTheDocument();
  });
});
