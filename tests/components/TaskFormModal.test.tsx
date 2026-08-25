import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TaskFormModal } from '@/components/TaskFormModal';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TaskFormModal', () => {
  it('não salva sem título', () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(<TaskFormModal task={null} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByText('salvar'));
    expect(screen.getByRole('alert').textContent).toContain('título obrigatório');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cria uma tarefa nova ao salvar com título preenchido', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const onSaved = vi.fn();
    render(<TaskFormModal task={null} onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'Nova tarefa' } });
    fireEvent.click(screen.getByText('salvar'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({ method: 'POST' }));
  });

  it('mostra o erro devolvido pela API sem fechar o formulário', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'data inválida: 32/13' }), { status: 400 }),
    );
    const onSaved = vi.fn();
    render(
      <TaskFormModal
        task={{ id: 'T1', title: 'Tarefa', completed: false, due: '', priority: 'normal', time: '', recur: '', notes: '', subtasks: [] }}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByText('salvar'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('data inválida'));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('ciclar a prioridade avança normal -> alta -> baixa', () => {
    render(<TaskFormModal task={null} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByText(/prioridade: normal/));
    expect(screen.getByText(/prioridade: alta/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/prioridade: alta/));
    expect(screen.getByText(/prioridade: baixa/)).toBeInTheDocument();
  });

  it('ciclar a repetição avança pelos quatro valores em português', () => {
    render(<TaskFormModal task={null} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByText(/repetição: não repete/));
    expect(screen.getByText(/repetição: diária/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/repetição: diária/));
    expect(screen.getByText(/repetição: semanal/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/repetição: semanal/));
    expect(screen.getByText(/repetição: mensal/)).toBeInTheDocument();
  });

  it('fecha com a tecla Escape', () => {
    const onClose = vi.fn();
    render(<TaskFormModal task={null} onClose={onClose} onSaved={() => {}} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
