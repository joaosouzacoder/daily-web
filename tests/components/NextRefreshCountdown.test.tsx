import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { NextRefreshCountdown } from '@/components/NextRefreshCountdown';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-11T12:00:00Z') });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('NextRefreshCountdown', () => {
  it('mostra o tempo que falta para o próximo ciclo', () => {
    render(<NextRefreshCountdown nextAt="2026-09-11T12:09:41Z" />);
    expect(screen.getByTestId('next-refresh').textContent).toBe('próxima em 9:41');
  });

  it('desconta um segundo a cada segundo', () => {
    render(<NextRefreshCountdown nextAt="2026-09-11T12:10:00Z" />);
    expect(screen.getByTestId('next-refresh').textContent).toBe('próxima em 10:00');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('next-refresh').textContent).toBe('próxima em 9:59');
  });

  // O servidor leva alguns segundos para montar o ciclo e o painel só lê o
  // novo horário na próxima consulta: até lá, zero não pode virar negativo.
  it('mostra que está sincronizando quando o horário já passou', () => {
    render(<NextRefreshCountdown nextAt="2026-09-11T11:59:50Z" />);
    expect(screen.getByTestId('next-refresh').textContent).toBe('sincronizando…');
  });

  it('não desenha nada sem horário agendado', () => {
    const { container } = render(<NextRefreshCountdown nextAt={null} />);
    expect(container.textContent).toBe('');
  });

  it('não desenha nada com horário inválido', () => {
    const { container } = render(<NextRefreshCountdown nextAt="lixo" />);
    expect(container.textContent).toBe('');
  });
});
