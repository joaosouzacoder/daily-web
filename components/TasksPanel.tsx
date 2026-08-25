'use client';

import { useState } from 'react';
import type { PanelResult, TodoTask } from '@/lib/types';
import { groupTasksByDueWindow } from '@/lib/taskGrouping';
import { TaskFormModal } from './TaskFormModal';

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return data.error ?? fallback;
}

function SubtaskList({
  task,
  onChanged,
  onError,
}: {
  task: TodoTask;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [newTitle, setNewTitle] = useState('');

  const toggleSubtask = async (subtaskId: string, completed: boolean) => {
    const res = await fetch(`/api/tasks/${task.id}/subtasks/${subtaskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    if (!res.ok) {
      onError(await readErrorMessage(res, 'falha ao atualizar subtarefa'));
      return;
    }
    onChanged();
  };

  const addSubtask = async () => {
    if (!newTitle.trim()) return;
    const res = await fetch(`/api/tasks/${task.id}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    if (!res.ok) {
      onError(await readErrorMessage(res, 'falha ao adicionar subtarefa'));
      return;
    }
    setNewTitle('');
    onChanged();
  };

  const removeSubtask = async (subtaskId: string) => {
    const res = await fetch(`/api/tasks/${task.id}/subtasks/${subtaskId}`, { method: 'DELETE' });
    if (!res.ok) {
      onError(await readErrorMessage(res, 'falha ao apagar subtarefa'));
      return;
    }
    onChanged();
  };

  return (
    <ul style={{ marginLeft: '1.5rem' }}>
      {task.subtasks.map((subtask) => (
        <li key={subtask.id} style={{ textDecoration: subtask.completed ? 'line-through' : 'none' }}>
          <input
            type="checkbox"
            checked={subtask.completed}
            onChange={() => void toggleSubtask(subtask.id, !subtask.completed)}
            aria-label={`concluir subtarefa ${subtask.title}`}
          />
          {subtask.title}
          <button onClick={() => void removeSubtask(subtask.id)} aria-label={`apagar subtarefa ${subtask.title}`}>
            x
          </button>
        </li>
      ))}
      <li>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="nova subtarefa"
          aria-label={`nova subtarefa de ${task.title}`}
        />
        <button onClick={() => void addSubtask()}>adicionar subtarefa</button>
      </li>
    </ul>
  );
}

export function TasksPanel({ tasks, onChanged }: { tasks: PanelResult<TodoTask[]>; onChanged: () => void }) {
  const [editing, setEditing] = useState<TodoTask | 'new' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const groups = groupTasksByDueWindow(tasks.data ?? []);

  const toggleComplete = async (task: TodoTask) => {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !task.completed }),
    });
    if (!res.ok) {
      setActionError(await readErrorMessage(res, 'falha ao atualizar tarefa'));
      return;
    }
    setActionError(null);
    onChanged();
  };

  const remove = async (task: TodoTask) => {
    const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setActionError(await readErrorMessage(res, 'falha ao apagar tarefa'));
      return;
    }
    setActionError(null);
    onChanged();
  };

  return (
    <section className="card" data-testid="tasks-panel">
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>Tarefas</h2>
        <button onClick={() => setEditing('new')}>nova tarefa</button>
      </header>
      {tasks.error && <p role="alert">{tasks.error}</p>}
      {actionError && <p role="alert">{actionError}</p>}
      {groups.map((group) => (
        <div key={group.key}>
          <strong>{group.label}</strong>
          <ul>
            {group.tasks.map((task) => (
              <li key={task.id} style={{ textDecoration: task.completed ? 'line-through' : 'none' }}>
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => void toggleComplete(task)}
                  aria-label={`concluir ${task.title}`}
                />
                {task.priority === 'high' && <span>!!!</span>}
                {task.priority === 'normal' && <span>!</span>}
                {task.recur !== '' && <span>↻</span>}
                <button onClick={() => setEditing(task)}>{task.title}</button>
                {task.due && <span> — {task.due}</span>}
                <button onClick={() => void remove(task)}>apagar</button>
                <SubtaskList task={task} onChanged={onChanged} onError={setActionError} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {editing && (
        <TaskFormModal
          task={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}
