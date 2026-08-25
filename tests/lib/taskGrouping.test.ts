import { describe, expect, it } from 'vitest';
import { groupTasksByDueWindow } from '@/lib/taskGrouping';
import type { TodoTask } from '@/lib/types';

const today = new Date('2026-08-25T12:00:00Z');

function task(over: Partial<TodoTask>): TodoTask {
  return {
    id: over.id ?? 'x', title: over.title ?? 't', completed: over.completed ?? false,
    due: over.due ?? '', priority: over.priority ?? 'normal', time: '', recur: '', notes: '',
    subtasks: [],
  };
}

describe('groupTasksByDueWindow', () => {
  it('separa em atrasada/hoje/semana/mês/depois/sem data, nessa ordem', () => {
    const tasks = [
      task({ id: 'a', due: '2026-08-20' }),
      task({ id: 'b', due: '2026-08-25' }),
      task({ id: 'c', due: '2026-08-28' }),
      task({ id: 'd', due: '2026-09-15' }),
      task({ id: 'e', due: '2026-12-01' }),
      task({ id: 'f', due: '' }),
    ];
    const groups = groupTasksByDueWindow(tasks, today);
    expect(groups.map((g) => g.key)).toEqual(['overdue', 'today', 'week', 'month', 'later', 'noDate']);
  });

  it('omite faixas vazias', () => {
    const groups = groupTasksByDueWindow([task({ due: '2026-08-25' })], today);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('today');
    expect(groups[0].label).toBe('HOJE');
  });

  it('ordena por vencimento, depois prioridade, concluídas no fim', () => {
    const tasks = [
      task({ id: 'low', due: '2026-08-25', priority: 'low' }),
      task({ id: 'high', due: '2026-08-25', priority: 'high' }),
      task({ id: 'done', due: '2026-08-25', priority: 'high', completed: true }),
    ];
    const groups = groupTasksByDueWindow(tasks, today);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['high', 'low', 'done']);
  });

  it('tarefa sem data cai em SEM DATA independente de estar completada', () => {
    const groups = groupTasksByDueWindow([task({ due: '', completed: true })], today);
    expect(groups[0].key).toBe('noDate');
  });
});
