import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getPomodoroState, startPomodoro, pausePomodoro, resetPomodoro, onPhaseChange, resetStateForTests,
} from '@/lib/pomodoro';

beforeEach(() => {
  resetStateForTests();
  vi.useRealTimers();
});

describe('pomodoro', () => {
  it('começa parado na fase de foco com o tempo cheio', () => {
    const s = getPomodoroState();
    expect(s.phase).toBe('focus');
    expect(s.running).toBe(false);
    expect(s.remainingSeconds).toBe(25 * 60);
  });

  it('conta o tempo regressivamente enquanto rodando', () => {
    vi.setSystemTime(new Date('2026-08-25T10:00:00Z'));
    startPomodoro();
    vi.setSystemTime(new Date('2026-08-25T10:00:10Z'));
    expect(getPomodoroState().remainingSeconds).toBe(25 * 60 - 10);
  });

  it('pausar interrompe a contagem', () => {
    vi.setSystemTime(new Date('2026-08-25T10:00:00Z'));
    startPomodoro();
    vi.setSystemTime(new Date('2026-08-25T10:00:10Z'));
    pausePomodoro();
    vi.setSystemTime(new Date('2026-08-25T10:05:00Z'));
    const s = getPomodoroState();
    expect(s.remainingSeconds).toBe(25 * 60 - 10);
    expect(s.running).toBe(false);
  });

  it('ao terminar o foco, o descanso começa sozinho e soma um foco', () => {
    vi.setSystemTime(new Date('2026-08-25T10:00:00Z'));
    startPomodoro();
    vi.setSystemTime(new Date('2026-08-25T10:25:01Z'));
    const s = getPomodoroState();
    expect(s.phase).toBe('rest');
    expect(s.running).toBe(true);
    expect(s.completedFocusCount).toBe(1);
  });

  it('ao terminar o descanso, volta a foco e espera o próximo "iniciar"', () => {
    vi.setSystemTime(new Date('2026-08-25T10:00:00Z'));
    startPomodoro();
    vi.setSystemTime(new Date('2026-08-25T10:30:01Z'));
    const s = getPomodoroState();
    expect(s.phase).toBe('focus');
    expect(s.running).toBe(false);
  });

  it('reset zera a fase sem apagar o contador de focos', () => {
    vi.setSystemTime(new Date('2026-08-25T10:00:00Z'));
    startPomodoro();
    vi.setSystemTime(new Date('2026-08-25T10:25:01Z'));
    getPomodoroState();
    resetPomodoro();
    const s = getPomodoroState();
    expect(s.phase).toBe('focus');
    expect(s.remainingSeconds).toBe(25 * 60);
    expect(s.completedFocusCount).toBe(1);
  });

  it('notifica os listeners quando a fase vira', () => {
    const seen: string[] = [];
    const unsubscribe = onPhaseChange((phase) => seen.push(phase));
    vi.setSystemTime(new Date('2026-08-25T10:00:00Z'));
    startPomodoro();
    vi.setSystemTime(new Date('2026-08-25T10:25:01Z'));
    getPomodoroState();
    expect(seen).toEqual(['rest']);
    unsubscribe();
  });
});
