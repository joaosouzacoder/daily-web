import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Clock } from '@/components/Clock';

afterEach(cleanup);

describe('Clock', () => {
  it('renderiza a hora no formato HH:MM:SS', () => {
    render(<Clock />);
    expect(screen.getByTestId('clock-time').textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('renderiza a data por extenso em português', () => {
    render(<Clock />);
    expect(screen.getByTestId('clock-date').textContent).toMatch(
      /(domingo|segunda|terça|quarta|quinta|sexta|sábado)/,
    );
  });
});
