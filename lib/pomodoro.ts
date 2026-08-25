import type { PomodoroPhase, PomodoroState } from '@/lib/types';

const FOCUS_MINUTES = Number(process.env.POMODORO_FOCUS_MINUTES ?? '25');
const REST_MINUTES = Number(process.env.POMODORO_REST_MINUTES ?? '5');
const ENABLED = (process.env.POMODORO_ENABLED ?? 'true') !== 'false';

interface InternalState {
  phase: PomodoroPhase;
  running: boolean;
  remainingSeconds: number;
  completedFocusCount: number;
  lastTickAt: number;
}

function initialState(): InternalState {
  return {
    phase: 'focus',
    running: false,
    remainingSeconds: FOCUS_MINUTES * 60,
    completedFocusCount: 0,
    lastTickAt: Date.now(),
  };
}

let state: InternalState = initialState();

type PhaseChangeListener = (phase: PomodoroPhase) => void;
const listeners = new Set<PhaseChangeListener>();

export function onPhaseChange(listener: PhaseChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function phaseSeconds(phase: PomodoroPhase): number {
  return (phase === 'focus' ? FOCUS_MINUTES : REST_MINUTES) * 60;
}

function tick(): void {
  if (!state.running) {
    state.lastTickAt = Date.now();
    return;
  }
  const now = Date.now();
  const elapsed = Math.floor((now - state.lastTickAt) / 1000);
  if (elapsed <= 0) return;
  state.lastTickAt = now;
  state.remainingSeconds -= elapsed;

  while (state.remainingSeconds <= 0) {
    const finishedPhase = state.phase;
    if (finishedPhase === 'focus') state.completedFocusCount += 1;
    const nextPhase: PomodoroPhase = finishedPhase === 'focus' ? 'rest' : 'focus';
    state.remainingSeconds += phaseSeconds(nextPhase);
    state.phase = nextPhase;
    state.running = nextPhase === 'rest';
    for (const listener of listeners) listener(nextPhase);
  }
}

export function getPomodoroState(): PomodoroState {
  tick();
  return {
    enabled: ENABLED,
    phase: state.phase,
    running: state.running,
    remainingSeconds: Math.max(0, state.remainingSeconds),
    focusMinutes: FOCUS_MINUTES,
    restMinutes: REST_MINUTES,
    completedFocusCount: state.completedFocusCount,
  };
}

export function startPomodoro(): PomodoroState {
  tick();
  state.running = true;
  state.lastTickAt = Date.now();
  return getPomodoroState();
}

export function pausePomodoro(): PomodoroState {
  tick();
  state.running = false;
  return getPomodoroState();
}

export function resetPomodoro(): PomodoroState {
  state.phase = 'focus';
  state.running = false;
  state.remainingSeconds = phaseSeconds('focus');
  state.lastTickAt = Date.now();
  return getPomodoroState();
}

export function resetStateForTests(): void {
  state = initialState();
  listeners.clear();
}
