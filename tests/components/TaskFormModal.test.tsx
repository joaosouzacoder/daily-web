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

  it('ciclar a prioridade avança normal -> alta -> baixa -> normal', () => {
    render(<TaskFormModal task={null} onClose={() => {}} onSaved={() => {}} />);
    const button = screen.getByText(/prioridade: normal/);
    fireEvent.click(button);
    expect(screen.getByText(/prioridade: high/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/prioridade: high/));
    expect(screen.getByText(/prioridade: low/)).toBeInTheDocument();
  });
});
