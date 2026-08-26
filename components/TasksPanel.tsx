'use client';

import { useMemo, useState } from 'react';
import { NavArrowRight } from 'iconoir-react';
import type { PanelResult, TaskPriority, TodoTask } from '@/lib/types';
import type { ActiveFilter } from '@/lib/filters';
import { matchesQuery } from '@/lib/filters';
import { groupTasksByDueWindow } from '@/lib/taskGrouping';
import type { TaskGroupKey } from '@/lib/taskGrouping';
import { TaskFormModal } from './TaskFormModal';
import { Section } from './ui/Section';
import { FilterBar } from './ui/FilterBar';
import { SearchInput } from './ui/SearchInput';
import { Chip } from './ui/Chip';
import { ActiveFilters } from './ui/ActiveFilters';
import { EmptyState } from './ui/EmptyState';
import { SkeletonRows } from './ui/Skeleton';

interface Props {
  tasks: PanelResult<TodoTask[]>;
  onChanged: () => void;
  loading?: boolean;
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: 'Alta',
  normal: 'Normal',
  low: 'Baixa',
};

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return data.error ?? fallback;
}

// As faixas vêm em caixa alta para servirem de cabeçalho da lista; no chip
// elas viram texto normal, com só a primeira letra maiúscula.
export function chipCase(label: string): string {
  const lower = label.toLocaleLowerCase('pt-BR');
  return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
}

// A faixa já diz de que período a tarefa é (hoje, esta semana…), então o
// ano é redundante na linha: dia/mês basta, com a hora quando existir.
export function formatDue(due: string, time: string): string {
  const [, month, day] = due.split('-');
  if (!month || !day) return due;
  return time ? `${day}/${month} ${time}` : `${day}/${month}`;
}

function SubtaskList({
  task,
  onChanged,
  onError,
  adding,
  onDoneAdding,
}: {
  task: TodoTask;
  onChanged: () => void;
  onError: (message: string) => void;
  adding: boolean;
  onDoneAdding: () => void;
}) {
  const [newTitle, setNewTitle] = useState('');

  const toggleSubtask = async (subtaskId: string, completed: boolean) => {
    const res = await fetch(`/api/tasks/${task.id}/subtasks/${subtaskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    if (!res.ok) {
      onError(await readErrorMessage(res, 'Falha ao atualizar subtarefa'));
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
      onError(await readErrorMessage(res, 'Falha ao adicionar subtarefa'));
      return;
    }
    setNewTitle('');
    onDoneAdding();
    onChanged();
  };

  const removeSubtask = async (subtaskId: string) => {
    const res = await fetch(`/api/tasks/${task.id}/subtasks/${subtaskId}`, { method: 'DELETE' });
    if (!res.ok) {
      onError(await readErrorMessage(res, 'Falha ao apagar subtarefa'));
      return;
    }
    onChanged();
  };

  return (
    <div className="subtasks">
      {task.subtasks.map((subtask) => (
        <div key={subtask.id} className={`subtask${subtask.completed ? ' is-done' : ''}`}>
          <input
            type="checkbox"
            checked={subtask.completed}
            onChange={() => void toggleSubtask(subtask.id, !subtask.completed)}
            aria-label={`concluir subtarefa ${subtask.title}`}
          />
          <span className="subtask-title">{subtask.title}</span>
          <button
            type="button"
            className="btn btn-ghost btn-danger"
            onClick={() => void removeSubtask(subtask.id)}
            aria-label={`apagar subtarefa ${subtask.title}`}
          >
            ×
          </button>
        </div>
      ))}
      {adding && (
        <div className="subtask-add">
          <input
            className="field"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addSubtask();
              if (e.key === 'Escape') onDoneAdding();
            }}
            placeholder="nova subtarefa"
            aria-label={`nova subtarefa de ${task.title}`}
            autoFocus
          />
          <button type="button" className="btn" onClick={() => void addSubtask()}>
            Adicionar
          </button>
        </div>
      )}
    </div>
  );
}

export function TasksPanel({ tasks, onChanged, loading = false }: Props) {
  const [editing, setEditing] = useState<TodoTask | 'new' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState<TaskPriority | 'all'>('all');
  const [windowKey, setWindowKey] = useState<TaskGroupKey | 'all'>('all');
  // Concluída é ruído no dia a dia: some por padrão e só volta se pedirem.
  const [showCompleted, setShowCompleted] = useState(false);
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  // Subtarefa é detalhe da tarefa pai: fica recolhida até alguém pedir para
  // ver. Sem isso, uma lista com dez tarefas de três etapas vira quarenta
  // linhas e a lista principal deixa de ser legível de relance.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Quem clica no "+" quer ver o campo — e o que já existe ali junto.
  const startAddingSubtask = (id: string) => {
    setAddingSubtaskFor((cur) => (cur === id ? null : id));
    setExpanded((prev) => new Set(prev).add(id));
  };

  const all = useMemo(() => tasks.data ?? [], [tasks.data]);

  const filtered = useMemo(
    () =>
      all.filter(
        (t) =>
          matchesQuery([t.title], query) &&
          (priority === 'all' || t.priority === priority) &&
          (showCompleted || !t.completed),
      ),
    [all, query, priority, showCompleted],
  );

  const groups = useMemo(() => {
    const grouped = groupTasksByDueWindow(filtered);
    return windowKey === 'all' ? grouped : grouped.filter((g) => g.key === windowKey);
  }, [filtered, windowKey]);

  const availableWindows = useMemo(() => groupTasksByDueWindow(all), [all]);
  const visibleCount = groups.reduce((sum, g) => sum + g.tasks.length, 0);

  const activeFilters: ActiveFilter[] = [
    ...(query.trim() ? [{ id: 'query', label: `Busca: ${query.trim()}` }] : []),
    ...(priority !== 'all' ? [{ id: 'priority', label: PRIORITY_LABEL[priority] }] : []),
    ...(windowKey !== 'all'
      ? [
          {
            id: 'window',
            label: availableWindows.find((g) => g.key === windowKey)?.label ?? String(windowKey),
          },
        ]
      : []),
  ];

  const clearFilter = (id: string) => {
    if (id === 'query') setQuery('');
    if (id === 'priority') setPriority('all');
    if (id === 'window') setWindowKey('all');
  };

  const clearAll = () => {
    setQuery('');
    setPriority('all');
    setWindowKey('all');
  };

  const toggleComplete = async (task: TodoTask) => {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !task.completed }),
    });
    if (!res.ok) {
      setActionError(await readErrorMessage(res, 'Falha ao atualizar tarefa'));
      return;
    }
    setActionError(null);
    onChanged();
  };

  const remove = async (task: TodoTask) => {
    const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setActionError(await readErrorMessage(res, 'Falha ao apagar tarefa'));
      return;
    }
    setActionError(null);
    onChanged();
  };

  return (
    <Section
      eyebrow="Tarefas"
      count={activeFilters.length > 0 ? `${visibleCount} de ${all.length}` : undefined}
      actions={
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          Nova tarefa
        </button>
      }
    >
      <FilterBar label="Filtrar tarefas">
        <SearchInput value={query} onChange={setQuery} label="buscar tarefas" placeholder="título" />
        <Chip active={priority === 'high'} onClick={() => setPriority(priority === 'high' ? 'all' : 'high')}>
          Alta
        </Chip>
        <Chip active={priority === 'low'} onClick={() => setPriority(priority === 'low' ? 'all' : 'low')}>
          Baixa
        </Chip>
        <Chip active={showCompleted} onClick={() => setShowCompleted((v) => !v)}>
          Concluídas
        </Chip>
        {availableWindows.map((g) => (
          <Chip
            key={g.key}
            active={windowKey === g.key}
            onClick={() => setWindowKey(windowKey === g.key ? 'all' : g.key)}
          >
            {chipCase(g.label)}
          </Chip>
        ))}
      </FilterBar>

      <ActiveFilters filters={activeFilters} onRemove={clearFilter} onClearAll={clearAll} />

      {tasks.error && (
        <p role="alert" className="panel-error">
          {tasks.error}
        </p>
      )}
      {actionError && (
        <p role="alert" className="panel-error">
          {actionError}
        </p>
      )}

      {loading && all.length === 0 && <SkeletonRows count={5} />}

      {!loading && all.length === 0 && !tasks.error && (
        <EmptyState message="Nenhuma tarefa por aqui. Crie a primeira." />
      )}

      {all.length > 0 && visibleCount === 0 && (
        <EmptyState message="Nenhuma tarefa com esses filtros." />
      )}

      {groups.map((group) => (
        <div key={group.key}>
          <h3 className="task-group-label eyebrow">{group.label}</h3>
          <ul>
            {group.tasks.map((task) => (
              <li key={task.id} className="task-item">
                <div className={`row task-row${task.completed ? ' is-done' : ''}`}>
                  {/* A seta só existe onde há o que revelar. Numa tarefa sem
                      subtarefa ela seria um controle que não faz nada. */}
                  {task.subtasks.length > 0 ? (
                    <button
                      type="button"
                      className="subtask-caret"
                      aria-label={`${expanded.has(task.id) ? 'recolher' : 'expandir'} subtarefas de ${task.title}`}
                      aria-expanded={expanded.has(task.id)}
                      onClick={() => toggleExpanded(task.id)}
                    >
                      <NavArrowRight width={14} height={14} />
                    </button>
                  ) : (
                    <span className="subtask-caret is-empty" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    className="subtask-toggle"
                    aria-label={`adicionar subtarefa em ${task.title}`}
                    aria-expanded={addingSubtaskFor === task.id}
                    onClick={() => startAddingSubtask(task.id)}
                  >
                    +
                  </button>
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => void toggleComplete(task)}
                    aria-label={`concluir ${task.title}`}
                  />
                  <button type="button" className="row-main" onClick={() => setEditing(task)}>
                    <span className="row-title">{task.title}</span>
                  </button>
                  {task.priority !== 'normal' && (
                    <span className={`task-flag task-flag-${task.priority}`}>
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                  )}
                  {task.recur !== '' && (
                    <span className="task-flag" title="tarefa recorrente">
                      repete
                    </span>
                  )}
                  {task.due && <span className="task-due mono">{formatDue(task.due, task.time)}</span>}
                  {task.subtasks.length > 0 && (
                    <span className="task-due mono" title="subtarefas concluídas">
                      {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length}
                    </span>
                  )}
                  {/* O contador acima é o que faz a subtarefa escondida ainda
                      ser visível como informação: dá para ver que existe e
                      quanto falta sem abrir. */}
                  <button
                    type="button"
                    className="btn btn-ghost btn-danger"
                    onClick={() => void remove(task)}
                    aria-label={`apagar ${task.title}`}
                  >
                    Apagar
                  </button>
                </div>
                {(expanded.has(task.id) || addingSubtaskFor === task.id) && (
                  <SubtaskList
                    task={task}
                    onChanged={onChanged}
                    onError={setActionError}
                    adding={addingSubtaskFor === task.id}
                    onDoneAdding={() => setAddingSubtaskFor(null)}
                  />
                )}
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
    </Section>
  );
}
