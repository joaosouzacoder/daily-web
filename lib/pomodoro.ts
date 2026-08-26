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

// Um pomodoro por usuário. Era um `let state` de módulo, o que fazia duas
// pessoas logadas compartilharem o mesmo cronômetro: quem apertasse pausa
// pausava o da outra.
const states = new Map<string, InternalState>();

function stateFor(userId: string): InternalState {
  let state = states.get(userId);
  if (!state) {
    state = initialState();
    states.set(userId, state);
  }
  return state;
}

type PhaseChangeListener = (phase: PomodoroPhase, userId: string) => void;
const listeners = new Set<PhaseChangeListener>();

export function onPhaseChange(listener: PhaseChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function phaseSeconds(phase: PomodoroPhase): number {
  return (phase === 'focus' ? FOCUS_MINUTES : REST_MINUTES) * 60;
}

function tick(userId: string): void {
  const state = stateFor(userId);
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
    for (const listener of listeners) listener(nextPhase, userId);
  }
}

export function getPomodoroState(userId: string): PomodoroState {
  tick(userId);
  const state = stateFor(userId);
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

export function startPomodoro(userId: string): PomodoroState {
  tick(userId);
  const state = stateFor(userId);
  state.running = true;
  state.lastTickAt = Date.now();
  return getPomodoroState(userId);
}

export function pausePomodoro(userId: string): PomodoroState {
  tick(userId);
  stateFor(userId).running = false;
  return getPomodoroState(userId);
}

export function resetPomodoro(userId: string): PomodoroState {
  // Zera a fase, não o histórico: o contador de focos concluídos sobrevive ao
  // reset, como antes do estado virar por usuário.
  const state = stateFor(userId);
  state.phase = 'focus';
  state.running = false;
  state.remainingSeconds = phaseSeconds('focus');
  state.lastTickAt = Date.now();
  return getPomodoroState(userId);
}

// Quem já tem cronômetro em andamento. O tick de fundo só precisa visitar
// esses — criar estado para todo usuário cadastrado seria trabalho à toa.
export function activePomodoroUsers(): string[] {
  return [...states.keys()];
}

export function resetStateForTests(): void {
  states.clear();
  listeners.clear();
}
