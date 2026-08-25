import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Clock } from '@/components/Clock';

afterEach(cleanup);

describe('Clock', () => {
  it('renderiza a hora no formato HH:MM:SS', () => {
    render(<Clock />);
    const text = screen.getByTestId('clock').textContent ?? '';
    expect(text).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
