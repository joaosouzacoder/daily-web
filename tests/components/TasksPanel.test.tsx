import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TasksPanel } from '@/components/TasksPanel';
import type { TodoTask } from '@/lib/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const tasks: TodoTask[] = [
  { id: 'a', title: 'Comprar café', completed: false, due: '2026-08-25', priority: 'high', time: '', recur: '', notes: '', subtasks: [] },
];

const taskWithSubtasks: TodoTask[] = [
  {
    id: 'a',
    title: 'Comprar café',
    completed: false,
    due: '2026-08-25',
    priority: 'high',
    time: '',
    recur: '',
    notes: '',
    subtasks: [
      { id: 's1', title: 'Grãos', completed: false },
      { id: 's2', title: 'Filtro', completed: true },
    ],
  },
];

describe('TasksPanel', () => {
  it('agrupa por faixa de prazo e mostra o marcador de prioridade', () => {
    render(<TasksPanel tasks={{ data: tasks, error: null }} onChanged={() => {}} />);
    expect(screen.getByText('HOJE')).toBeInTheDocument();
    expect(screen.getByText('!!!')).toBeInTheDocument();
  });

  it('abre o formulário ao clicar em uma tarefa', () => {
    render(<TasksPanel tasks={{ data: tasks, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByText('Comprar café'));
    expect(screen.getByRole('dialog', { name: 'formulário de tarefa' })).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<TasksPanel tasks={{ data: [], error: 'mstodo falhou: sem credenciais' }} onChanged={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('sem credenciais');
  });

  it('apagar uma tarefa com resposta não-ok mostra erro visível e não chama onChanged', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'mstodo falhou: id não encontrado' }), { status: 502 }),
    );
    const onChanged = vi.fn();
    render(<TasksPanel tasks={{ data: tasks, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByText('apagar'));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('id não encontrado'),
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('apagar uma tarefa com sucesso chama onChanged e não mostra erro', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const onChanged = vi.fn();
    render(<TasksPanel tasks={{ data: tasks, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByText('apagar'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renderiza as subtarefas quando presentes', () => {
    render(<TasksPanel tasks={{ data: taskWithSubtasks, error: null }} onChanged={() => {}} />);
    expect(screen.getByText('Grãos')).toBeInTheDocument();
    expect(screen.getByText('Filtro')).toBeInTheDocument();
    expect(screen.getByLabelText('concluir subtarefa Grãos')).not.toBeChecked();
    expect(screen.getByLabelText('concluir subtarefa Filtro')).toBeChecked();
  });

  it('não renderiza itens de subtarefa quando a lista está vazia', () => {
    render(<TasksPanel tasks={{ data: tasks, error: null }} onChanged={() => {}} />);
    expect(screen.queryByLabelText(/concluir subtarefa/)).toBeNull();
  });

  it('marcar o checkbox de uma subtarefa chama o PATCH correto', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const onChanged = vi.fn();
    render(<TasksPanel tasks={{ data: taskWithSubtasks, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText('concluir subtarefa Grãos'));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/tasks/a/subtasks/s1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ completed: true }),
        }),
      ),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('adicionar uma subtarefa chama o POST correto e limpa o campo', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const onChanged = vi.fn();
    render(<TasksPanel tasks={{ data: tasks, error: null }} onChanged={onChanged} />);
    const input = screen.getByLabelText('nova subtarefa de Comprar café');
    fireEvent.change(input, { target: { value: 'Açúcar' } });
    fireEvent.click(screen.getByText('adicionar subtarefa'));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/tasks/a/subtasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Açúcar' }),
        }),
      ),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('apagar uma subtarefa chama o DELETE correto', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const onChanged = vi.fn();
    render(<TasksPanel tasks={{ data: taskWithSubtasks, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText('apagar subtarefa Grãos'));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/tasks/a/subtasks/s1', { method: 'DELETE' }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
