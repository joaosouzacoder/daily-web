import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { useDashboardState } from '@/lib/hooks/usePolling';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Probe() {
  const { state, loading, refreshNow } = useDashboardState();
  return (
    <div>
      <span data-testid="updated-at">{state?.updatedAt ?? 'carregando'}</span>
      <span data-testid="loading">{String(loading)}</span>
      <button onClick={() => void refreshNow()}>atualizar</button>
    </div>
  );
}

describe('useDashboardState', () => {
  it('carrega o estado ao montar', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ updatedAt: '2026-08-25T10:00:00.000Z' })),
    );
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('updated-at').textContent).toBe('2026-08-25T10:00:00.000Z'));
  });

  it('refreshNow chama POST /api/refresh e atualiza o estado', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ updatedAt: 'inicial' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ updatedAt: 'apos-refresh' })));
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('updated-at').textContent).toBe('inicial'));
    fireEvent.click(screen.getByText('atualizar'));
    await waitFor(() => expect(screen.getByTestId('updated-at').textContent).toBe('apos-refresh'));
    expect(fetchSpy).toHaveBeenCalledWith('/api/refresh', { method: 'POST' });
  });
});
