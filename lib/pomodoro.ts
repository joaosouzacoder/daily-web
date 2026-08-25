import type { PomodoroState } from '@/lib/types';

export function getPomodoroState(): PomodoroState {
  return {
    enabled: true, phase: 'focus', running: false, remainingSeconds: 25 * 60,
    focusMinutes: 25, restMinutes: 5, completedFocusCount: 0,
  };
}
