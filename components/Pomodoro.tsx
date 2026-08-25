'use client';

import { useEffect, useRef } from 'react';
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
  void fetch('/api/pomodoro/notify-fallback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase }),
  });
}

export function Pomodoro({ pomodoro, onChanged }: Props) {
  const lastPhase = useRef<PomodoroPhase | null>(null);

  useEffect(() => {
    if (!pomodoro) return;
    if (lastPhase.current !== null && lastPhase.current !== pomodoro.phase) {
      notifyPhaseChange(pomodoro.phase);
    }
    lastPhase.current = pomodoro.phase;
  }, [pomodoro?.phase]);

  if (!pomodoro || !pomodoro.enabled) return null;

  const toggle = async () => {
    await fetch(pomodoro.running ? '/api/pomodoro/pause' : '/api/pomodoro/start', { method: 'POST' });
    onChanged();
  };

  const reset = async () => {
    await fetch('/api/pomodoro/reset', { method: 'POST' });
    onChanged();
  };

  return (
    <div data-testid="pomodoro" className="card" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
      <span>{pomodoro.phase === 'focus' ? 'Foco' : 'Descanso'}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatRemaining(pomodoro.remainingSeconds)}</span>
      <span>{pomodoro.completedFocusCount} focos</span>
      <button onClick={() => void toggle()}>{pomodoro.running ? 'pausar' : 'iniciar'}</button>
      <button onClick={() => void reset()}>zerar</button>
    </div>
  );
}
