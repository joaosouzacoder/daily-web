import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { PullsPanel } from '@/components/PullsPanel';
import type { PullRequestItem } from '@/lib/types';

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ repos: [] }), { status: 200 }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function pull(over: Partial<PullRequestItem>): PullRequestItem {
  return {
    repo: 'joao/daily-web',
    number: 3,
    title: 'Arrumar o build',
    url: 'https://github.com/joao/daily-web/pull/3',
    author: 'joao',
    draft: false,
    awaitingYou: false,
    mine: true,
    isPullRequest: true,
    updatedAt: '2026-08-26T10:00:00Z',
    ...over,
  };
}

describe('PullsPanel', () => {
  it('lista cada PR com link para o GitHub', () => {
    render(<PullsPanel pulls={{ data: { items: [pull({})], errors: [] }, error: null }} />);
    const link = screen.getByRole('link', { name: 'Arrumar o build' });
    expect(link).toHaveAttribute('href', 'https://github.com/joao/daily-web/pull/3');
    // O repositório virou cabeçalho do bloco; a linha só carrega o número.
    expect(screen.getByRole('heading', { name: 'joao/daily-web' })).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
  });

  it('marca o PR que está esperando a sua revisão', () => {
    render(
      <PullsPanel
        pulls={{ data: { items: [pull({ awaitingYou: true })], errors: [] }, error: null }}
      />,
    );
    expect(screen.getByText('revisar')).toBeInTheDocument();
  });

  it('mostra o autor quando o PR não é seu', () => {
    render(
      <PullsPanel
        pulls={{
          data: { items: [pull({ mine: false, author: 'dependabot[bot]' })], errors: [] },
          error: null,
        }}
      />,
    );
    expect(screen.getByText('dependabot[bot]')).toBeInTheDocument();
  });

  it('marca rascunho', () => {
    render(<PullsPanel pulls={{ data: { items: [pull({ draft: true })], errors: [] }, error: null }} />);
    expect(screen.getByText('rascunho')).toBeInTheDocument();
  });

  // Um repositório renomeado falha sozinho; os PRs dos outros continuam na
  // tela em vez de sumirem junto com ele.
  it('mostra o erro de um repositório sem esconder os PRs que vieram', () => {
    render(
      <PullsPanel
        pulls={{
          data: { items: [pull({})], errors: ['joao/antigo: GitHub respondeu 404'] },
          error: null,
        }}
      />,
    );
    expect(screen.getByText('Arrumar o build')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toContain('404');
  });

  it('mostra o erro do painel quando presente', () => {
    render(<PullsPanel pulls={{ data: { items: [], errors: [] }, error: 'o GitHub recusou o token' }} />);
    expect(screen.getByRole('alert').textContent).toContain('recusou o token');
  });

  it('busca e lista os repositórios acompanhados ao montar', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ repos: ['joaosouzacoder/daily-web'] }), { status: 200 }),
    );
    render(<PullsPanel pulls={{ data: { items: [], errors: [] }, error: null }} />);
    await waitFor(() => expect(screen.getByText('joaosouzacoder/daily-web')).toBeInTheDocument());
  });

  it('adiciona um repositório e chama onChanged', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ repos: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ repos: ['a/b'] }), { status: 200 }));
    const onChanged = vi.fn();
    render(<PullsPanel pulls={{ data: { items: [], errors: [] }, error: null }} onChanged={onChanged} />);
    fireEvent.change(screen.getByLabelText('novo repositório'), { target: { value: 'a/b' } });
    fireEvent.click(screen.getByText('Adicionar'));
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
    render(<PullsPanel pulls={{ data: { items: [], errors: [] }, error: null }} />);
    fireEvent.change(screen.getByLabelText('novo repositório'), { target: { value: '-x' } });
    fireEvent.click(screen.getByText('Adicionar'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('repositório inválido'));
  });

  it('remove um repositório e chama onChanged', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ repos: ['a/b'] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ repos: [] }), { status: 200 }));
    const onChanged = vi.fn();
    render(<PullsPanel pulls={{ data: { items: [], errors: [] }, error: null }} onChanged={onChanged} />);
    await waitFor(() => expect(screen.getByText('a/b')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('remover a/b'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/pulls/repos',
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ repo: 'a/b' }) }),
    );
  });
});
