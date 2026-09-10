'use client';

import { useEffect, useRef, useState } from 'react';
import type { TaskPriority, TodoTask } from '@/lib/types';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface Props {
  task: TodoTask | null;
  onClose: () => void;
  onSaved: () => void;
}

const RECUR_CYCLE = ['none', 'daily', 'weekly', 'monthly'] as const;
const PRIORITY_CYCLE: TaskPriority[] = ['normal', 'high', 'low'];

const RECUR_LABEL: Record<(typeof RECUR_CYCLE)[number], string> = {
  none: 'Não repete',
  daily: 'Diária',
  weekly: 'Semanal',
  monthly: 'Mensal',
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  normal: 'Normal',
  high: 'Alta',
  low: 'Baixa',
};

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
  const [saving, setSaving] = useState(false);
  // Dois cliques rápidos disparam duas vezes antes de o estado renderizar; o
  // ref barra a segunda chamada de imediato, o estado cuida do botão.
  const enviando = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cycle = <T,>(list: readonly T[], current: T): T =>
    list[(list.indexOf(current) + 1) % list.length];

  const save = async () => {
    if (enviando.current) return;
    if (!title.trim()) {
      setError('título obrigatório');
      return;
    }
    enviando.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = task
        ? await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, due, priority, recur }),
          })
        : await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              due,
              priority,
              recur: recur === 'none' ? undefined : recur,
            }),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Falha ao salvar');
        return;
      }
      onSaved();
    } catch {
      setError('Falha ao salvar');
    } finally {
      // Liberado mesmo em caso de erro: a pessoa precisa poder tentar de novo.
      enviando.current = false;
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-[min(460px,100%)] flex-col gap-4 overflow-y-auto rounded-xl border bg-glass-strong p-6 shadow-e5 backdrop-blur-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="formulário de tarefa"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="type-subhead">{task ? 'Editar tarefa' : 'Nova tarefa'}</h3>

        <label className="flex flex-col gap-2 text-sm text-ink-mid">
          Título
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>

        <label className="flex flex-col gap-2 text-sm text-ink-mid">
          Vencimento
          <Input value={due} onChange={(e) => setDue(e.target.value)} placeholder="hoje 14:30" />
          <span className="type-caption text-ink-dim">
            hoje, amanhã, +3d, AAAA-MM-DD — hora opcional no fim
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPriority(cycle(PRIORITY_CYCLE, priority))}
          >
            prioridade: {PRIORITY_LABEL[priority]}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRecur(cycle(RECUR_CYCLE, recur))}
          >
            repetição: {RECUR_LABEL[recur]}
          </Button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={saving || title.trim().length === 0}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
