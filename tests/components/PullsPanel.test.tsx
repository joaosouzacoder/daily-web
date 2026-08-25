import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { PullsPanel } from '@/components/PullsPanel';

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ repos: [] }), { status: 200 }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PullsPanel', () => {
  it('renderiza cada linha do digest e transforma URLs em links', () => {
    render(
      <PullsPanel
        pulls={{
          data: { lines: ['daily-web', 'PR #3 https://github.com/joaosouzacoder/daily-web/pull/3'] },
          error: null,
        }}
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://github.com/joaosouzacoder/daily-web/pull/3');
  });

  it('mostra o erro do painel quando presente', () => {
    render(<PullsPanel pulls={{ data: { lines: [] }, error: 'ghpending falhou: sem token' }} />);
    expect(screen.getByRole('alert').textContent).toContain('sem token');
  });

  it('busca e lista os repositórios rastreados ao montar', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ repos: ['joaosouzacoder/daily-web'] }), { status: 200 }),
    );
    render(<PullsPanel pulls={{ data: { lines: [] }, error: null }} />);
    await waitFor(() => expect(screen.getByText('joaosouzacoder/daily-web')).toBeInTheDocument());
  });

  it('adiciona um repositório e chama onChanged', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ repos: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ repos: ['a/b'] }), { status: 200 }));
    const onChanged = vi.fn();
    render(<PullsPanel pulls={{ data: { lines: [] }, error: null }} onChanged={onChanged} />);
    fireEvent.change(screen.getByLabelText('novo repositório'), { target: { value: 'a/b' } });
    fireEvent.click(screen.getByText('adicionar'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/pulls/repos',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ repo: 'a/b' }) }),
    );
  });

  it('mostra erro quando o servidor rejeita o repositório', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ repos: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'repositório inválido' }), { status: 400 }));
    render(<PullsPanel pulls={{ data: { lines: [] }, error: null }} />);
    fireEvent.change(screen.getByLabelText('novo repositório'), { target: { value: '-x' } });
    fireEvent.click(screen.getByText('adicionar'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('repositório inválido'));
  });

  it('remove um repositório e chama onChanged', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ repos: ['a/b'] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ repos: [] }), { status: 200 }));
    const onChanged = vi.fn();
    render(<PullsPanel pulls={{ data: { lines: [] }, error: null }} onChanged={onChanged} />);
    await waitFor(() => expect(screen.getByText('a/b')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('remover a/b'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/pulls/repos',
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ repo: 'a/b' }) }),
    );
  });
});
