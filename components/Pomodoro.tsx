'use client';

import { useEffect, useRef, useState } from 'react';
import type { PomodoroPhase, PomodoroState } from '@/lib/types';

interface Props {
  pomodoro: PomodoroState | null;
  onChanged: () => void;
}

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

// instrumentation.ts já dispara o push do ntfy a cada transição real de
// fase, mesmo sem nenhuma aba aberta. Aqui só existe o caminho PRIMÁRIO: a
// Notification API do navegador quando a aba está aberta com permissão.
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

  // Alimenta o fundo ambiente: a tela inteira esquenta durante o foco.
  useEffect(() => {
    const focusing = Boolean(pomodoro?.running && pomodoro.phase === 'focus');
    window.dispatchEvent(new CustomEvent('daily-web:focus', { detail: focusing }));
  }, [pomodoro?.running, pomodoro?.phase]);

  if (!pomodoro || !pomodoro.enabled) return null;

  const post = async (url: string, fallback: string) => {
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? fallback);
      return;
    }
    setError(null);
    onChanged();
  };

  const isFocus = pomodoro.phase === 'focus';
  const total = (isFocus ? pomodoro.focusMinutes : pomodoro.restMinutes) * 60;
  const progress = total > 0 ? 1 - pomodoro.remainingSeconds / total : 0;

  return (
    <div className="now-pomodoro" data-testid="pomodoro">
      <div className="now-pomo-meter" aria-hidden="true">
        <span
          className={`now-pomo-fill${isFocus ? ' is-focus' : ' is-rest'}`}
          style={{ transform: `scaleX(${Math.min(Math.max(progress, 0), 1)})` }}
        />
      </div>
      <div className="now-pomo-info">
        <span className="now-pomo-phase">{isFocus ? 'foco' : 'descanso'}</span>
        <span className="now-pomo-time mono">{formatRemaining(pomodoro.remainingSeconds)}</span>
        <span className="now-pomo-count mono" title="focos concluídos">
          {pomodoro.completedFocusCount} focos
        </span>
      </div>
      <div className="now-pomo-actions">
        <button
          type="button"
          className="btn"
          aria-label={pomodoro.running ? 'pausar foco' : 'iniciar foco'}
          onClick={() =>
            void post(
              pomodoro.running ? '/api/pomodoro/pause' : '/api/pomodoro/start',
              'falha ao atualizar pomodoro',
            )
          }
        >
          {pomodoro.running ? 'pausar' : 'iniciar'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          aria-label="zerar pomodoro"
          onClick={() => void post('/api/pomodoro/reset', 'falha ao zerar pomodoro')}
        >
          zerar
        </button>
      </div>
      {error && (
        <span role="alert" className="now-pomo-error">
          {error}
        </span>
      )}
    </div>
  );
}
