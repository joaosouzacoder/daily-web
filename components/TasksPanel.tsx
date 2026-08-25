'use client';

import { useState } from 'react';
import type { PanelResult, TodoTask } from '@/lib/types';
import { groupTasksByDueWindow } from '@/lib/taskGrouping';
import { TaskFormModal } from './TaskFormModal';

async function sendJson(url: string, body: unknown, method: string) {
  await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export function TasksPanel({ tasks, onChanged }: { tasks: PanelResult<TodoTask[]>; onChanged: () => void }) {
  const [editing, setEditing] = useState<TodoTask | 'new' | null>(null);
  const groups = groupTasksByDueWindow(tasks.data ?? []);

  const toggleComplete = async (task: TodoTask) => {
    await sendJson(`/api/tasks/${task.id}`, { completed: !task.completed }, 'PATCH');
    onChanged();
  };

  const remove = async (task: TodoTask) => {
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    onChanged();
  };

  return (
    <section className="card" data-testid="tasks-panel">
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>Tarefas</h2>
        <button onClick={() => setEditing('new')}>nova tarefa</button>
      </header>
      {tasks.error && <p role="alert">{tasks.error}</p>}
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
