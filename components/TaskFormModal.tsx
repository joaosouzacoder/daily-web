'use client';

import { useState } from 'react';
import type { TaskPriority, TodoTask } from '@/lib/types';

interface Props {
  task: TodoTask | null;
  onClose: () => void;
  onSaved: () => void;
}

const RECUR_CYCLE = ['none', 'daily', 'weekly', 'monthly'] as const;
const PRIORITY_CYCLE: TaskPriority[] = ['normal', 'high', 'low'];

function initialRecur(task: TodoTask | null): (typeof RECUR_CYCLE)[number] {
  if (task?.recur === 'daily' || task?.recur === 'weekly') return task.recur;
  if (task?.recur === 'absoluteMonthly') return 'monthly';
  return 'none';
}

export function TaskFormModal({ task, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [due, setDue] = useState(task?.due ? `${task.due}${task.time ? ` ${task.time}` : ''}` : '');
  const [recur, setRecur] = useState<(typeof RECUR_CYCLE)[number]>(initialRecur(task));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal');
  const [error, setError] = useState<string | null>(null);

  const cycle = <T,>(list: readonly T[], current: T): T => list[(list.indexOf(current) + 1) % list.length];

  const save = async () => {
    if (!title.trim()) {
      setError('título obrigatório');
      return;
    }
    setError(null);
    try {
      const res = task
        ? await fetch(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, due, priority, recur }),
          })
        : await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, due, priority, recur: recur === 'none' ? undefined : recur }),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'falha ao salvar');
        return;
      }
      onSaved();
    } catch {
      setError('falha ao salvar');
    }
  };

  return (
    <div role="dialog" aria-label="formulário de tarefa" className="card">
      <label>
        Título
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Vencimento (hoje, amanhã, +3d, AAAA-MM-DD, com hora opcional)
        <input value={due} onChange={(e) => setDue(e.target.value)} placeholder="hoje 14:30" />
      </label>
      <button type="button" onClick={() => setPriority(cycle(PRIORITY_CYCLE, priority))}>
        prioridade: {priority}
      </button>
      <button type="button" onClick={() => setRecur(cycle(RECUR_CYCLE, recur))}>
        repetição: {recur}
      </button>
      {error && <p role="alert">{error}</p>}
      <button onClick={() => void save()}>salvar</button>
      <button onClick={onClose}>cancelar</button>
    </div>
  );
}
