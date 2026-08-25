import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TasksPanel } from '@/components/TasksPanel';
import type { TodoTask } from '@/lib/types';

afterEach(cleanup);

const tasks: TodoTask[] = [
  { id: 'a', title: 'Comprar café', completed: false, due: '2026-08-25', priority: 'high', time: '', recur: '', notes: '', subtasks: [] },
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
});
