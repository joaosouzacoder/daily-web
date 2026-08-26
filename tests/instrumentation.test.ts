import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/refresher', () => ({
  startRefreshLoop: vi.fn(),
}));

vi.mock('@/lib/auth/users', () => ({ bootstrapFirstUser: vi.fn() }));

vi.mock('@/lib/pomodoro', () => ({
  getPomodoroState: vi.fn(),
  onPhaseChange: vi.fn(),
  // O tick de fundo só visita quem já tem cronômetro em andamento.
  activePomodoroUsers: vi.fn(() => ['u-1']),
}));

const ORIGINAL_RUNTIME = process.env.NEXT_RUNTIME;

beforeEach(() => {
  vi.useFakeTimers();
  process.env.NEXT_RUNTIME = 'nodejs';
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  process.env.NEXT_RUNTIME = ORIGINAL_RUNTIME;
});

describe('instrumentation register', () => {
  it('polls getPomodoroState on its own interval, independent of startRefreshLoop', async () => {
    const { getPomodoroState } = await import('@/lib/pomodoro');
    const { startRefreshLoop } = await import('@/lib/refresher');
    const { register } = await import('../instrumentation');

    await register();

    expect(startRefreshLoop).toHaveBeenCalledTimes(1);
    expect(getPomodoroState).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(getPomodoroState).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(getPomodoroState).toHaveBeenCalledTimes(2);

    // startRefreshLoop is only invoked once at boot; the fast poll interval
    // above is a separate mechanism, not a side effect of the 300s loop.
    expect(startRefreshLoop).toHaveBeenCalledTimes(1);
  });
});
