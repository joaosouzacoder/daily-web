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

function MutateProbe() {
  const { state, mutate, reload } = useDashboardState();
  return (
    <div>
      <span data-testid="updated-at">{state?.updatedAt ?? 'carregando'}</span>
      <button onClick={() => mutate((s) => ({ ...s, updatedAt: 'otimista' }))}>mutar</button>
      <button onClick={() => void reload()}>recarregar</button>
    </div>
  );
}

describe('mutate', () => {
  it('aplica a mudança na hora, sem esperar o servidor', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ updatedAt: 'inicial' })),
    );
    render(<MutateProbe />);
    await waitFor(() => expect(screen.getByTestId('updated-at').textContent).toBe('inicial'));

    fireEvent.click(screen.getByText('mutar'));
    expect(screen.getByTestId('updated-at').textContent).toBe('otimista');
  });

  // O caso que fazia a ação "voltar atrás" na tela: uma leitura pedida antes
  // da ação chega depois dela, trazendo o estado anterior.
  it('descarta resposta em voo que chegaria depois da mudança', async () => {
    let liberar: (r: Response) => void = () => {};
    const lenta = new Promise<Response>((resolve) => {
      liberar = resolve;
    });

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ updatedAt: 'inicial' })))
      .mockReturnValueOnce(lenta);

    render(<MutateProbe />);
    await waitFor(() => expect(screen.getByTestId('updated-at').textContent).toBe('inicial'));

    fireEvent.click(screen.getByText('recarregar'));
    fireEvent.click(screen.getByText('mutar'));
    expect(screen.getByTestId('updated-at').textContent).toBe('otimista');

    liberar(new Response(JSON.stringify({ updatedAt: 'antigo' })));
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.getByTestId('updated-at').textContent).toBe('otimista');
  });

  it('uma leitura posterior à mudança pode escrever', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ updatedAt: 'inicial' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ updatedAt: 'confirmado' })));

    render(<MutateProbe />);
    await waitFor(() => expect(screen.getByTestId('updated-at').textContent).toBe('inicial'));

    fireEvent.click(screen.getByText('mutar'));
    fireEvent.click(screen.getByText('recarregar'));

    await waitFor(() => expect(screen.getByTestId('updated-at').textContent).toBe('confirmado'));
  });
});
