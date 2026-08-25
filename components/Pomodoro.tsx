'use client';

import { useEffect, useRef, useState } from 'react';
import type { PomodoroPhase, PomodoroState } from '@/lib/types';

interface Props {
  pomodoro: PomodoroState | null;
  onChanged: () => void;
}

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// A instrumentation.ts server-side já dispara o push do ntfy de forma
// incondicional a cada transição de fase real (funciona mesmo sem nenhuma
// aba aberta) — este caminho client-side é só a notificação PRIMÁRIA via
// Notification API para quando a aba está aberta e a permissão foi
// concedida. Não há mais um POST de fallback aqui: ele duplicaria (ou seria
// redundante com) o push do servidor em todo caso.
function notifyPhaseChange(phase: PomodoroPhase): void {
  const message = phase === 'focus' ? 'Hora de focar' : 'Hora de descansar';
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    new Notification('daily-web', { body: message });
    return;
  }
  if (Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

export function Pomodoro({ pomodoro, onChanged }: Props) {
  const lastPhase = useRef<PomodoroPhase | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pomodoro) return;
    if (lastPhase.current !== null && lastPhase.current !== pomodoro.phase) {
      notifyPhaseChange(pomodoro.phase);
    }
    lastPhase.current = pomodoro.phase;
  }, [pomodoro?.phase]);

  if (!pomodoro || !pomodoro.enabled) return null;

  const toggle = async () => {
    const res = await fetch(pomodoro.running ? '/api/pomodoro/pause' : '/api/pomodoro/start', { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'falha ao atualizar pomodoro');
      return;
    }
    setError(null);
    onChanged();
  };

  const reset = async () => {
    const res = await fetch('/api/pomodoro/reset', { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'falha ao zerar pomodoro');
      return;
    }
    setError(null);
    onChanged();
  };

  return (
    <div data-testid="pomodoro" className="card" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
      <span>{pomodoro.phase === 'focus' ? 'Foco' : 'Descanso'}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatRemaining(pomodoro.remainingSeconds)}</span>
      <span>{pomodoro.completedFocusCount} focos</span>
      <button onClick={() => void toggle()}>{pomodoro.running ? 'pausar' : 'iniciar'}</button>
      <button onClick={() => void reset()}>zerar</button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
