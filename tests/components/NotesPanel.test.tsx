import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { NotesPanel } from '@/components/NotesPanel';
import type { Note } from '@/lib/types';

function nota(over: Partial<Note>): Note {
  return {
    id: '1',
    title: 'Ideias',
    body: '',
    position: 0,
    updatedAt: '2026-08-27T12:00:00Z',
    ...over,
  };
}

let chamadas: { url: string; method: string; body: unknown }[];

function responder(notas: Note[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      chamadas.push({ url, method, body });

      if (url === '/api/notes' && method === 'GET') {
        return new Response(JSON.stringify({ notes: notas }));
      }
      if (url === '/api/notes' && method === 'POST') {
        return new Response(
          JSON.stringify({ note: nota({ id: 'novo', title: (body as { title: string }).title }) }),
        );
      }
      if (method === 'DELETE') return new Response(JSON.stringify({ ok: true }));
      const alvo = notas.find((n) => url.endsWith(n.id)) ?? notas[0];
      return new Response(JSON.stringify({ note: { ...alvo, ...(body as object) } }));
    }),
  );
}

beforeEach(() => {
  chamadas = [];
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
});

describe('NotesPanel', () => {
  it('avisa quando não há nota nenhuma', async () => {
    responder([]);
    render(<NotesPanel />);
    expect(await screen.findByText(/Nenhuma nota ainda/)).toBeInTheDocument();
  });

  it('lista as abas e abre a primeira', async () => {
    responder([nota({ id: '1', title: 'Ideias', body: 'texto um' }), nota({ id: '2', title: 'Compras' })]);
    render(<NotesPanel />);

    expect(await screen.findByRole('button', { name: 'Ideias' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compras' })).toBeInTheDocument();
    expect(screen.getByLabelText('texto de Ideias')).toHaveValue('texto um');
  });

  it('trocar de aba troca o texto', async () => {
    responder([
      nota({ id: '1', title: 'Ideias', body: 'texto um' }),
      nota({ id: '2', title: 'Compras', body: 'texto dois' }),
    ]);
    render(<NotesPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Compras' }));
    await waitFor(() => expect(screen.getByLabelText('texto de Compras')).toHaveValue('texto dois'));
  });

  // Notepad não tem botão de salvar.
  it('salva sozinho depois que você para de digitar', async () => {
    responder([nota({ id: '1', title: 'Ideias' })]);
    render(<NotesPanel />);
    await screen.findByLabelText('texto de Ideias');

    fireEvent.change(screen.getByLabelText('texto de Ideias'), { target: { value: 'linha nova' } });
    expect(chamadas.some((c) => c.method === 'PATCH')).toBe(false);

    await vi.advanceTimersByTimeAsync(800);
    await waitFor(() =>
      expect(chamadas.find((c) => c.method === 'PATCH')?.body).toEqual({ body: 'linha nova' }),
    );
  });

  // Uma gravação por tecla encheria a rede à toa.
  it('não grava a cada tecla', async () => {
    responder([nota({ id: '1', title: 'Ideias' })]);
    render(<NotesPanel />);
    const campo = await screen.findByLabelText('texto de Ideias');

    fireEvent.change(campo, { target: { value: 'a' } });
    fireEvent.change(campo, { target: { value: 'ab' } });
    fireEvent.change(campo, { target: { value: 'abc' } });
    await vi.advanceTimersByTimeAsync(800);

    const patches = chamadas.filter((c) => c.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ body: 'abc' });
  });

  // Trocar de aba com gravação no ar gravaria o texto na aba errada.
  it('grava o pendente antes de trocar de aba', async () => {
    responder([
      nota({ id: '1', title: 'Ideias', body: '' }),
      nota({ id: '2', title: 'Compras', body: '' }),
    ]);
    render(<NotesPanel />);
    await screen.findByLabelText('texto de Ideias');

    fireEvent.change(screen.getByLabelText('texto de Ideias'), { target: { value: 'da primeira' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compras' }));

    await waitFor(() => {
      const patch = chamadas.find((c) => c.method === 'PATCH');
      expect(patch?.url).toContain('/1');
      expect(patch?.body).toEqual({ body: 'da primeira' });
    });
  });

  it('grava ao sair do campo, sem esperar o tempo', async () => {
    responder([nota({ id: '1', title: 'Ideias' })]);
    render(<NotesPanel />);
    const campo = await screen.findByLabelText('texto de Ideias');

    fireEvent.change(campo, { target: { value: 'texto' } });
    fireEvent.blur(campo);
    await waitFor(() => expect(chamadas.some((c) => c.method === 'PATCH')).toBe(true));
  });

  it('cria uma aba nova e foca nela', async () => {
    responder([nota({ id: '1', title: 'Ideias' })]);
    render(<NotesPanel />);
    await screen.findByLabelText('texto de Ideias');

    fireEvent.click(screen.getByRole('button', { name: 'Nova nota' }));
    await waitFor(() => expect(screen.getByLabelText('texto de Nota 2')).toBeInTheDocument());
  });

  it('apaga a aba depois de confirmar', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    responder([nota({ id: '1', title: 'Ideias' }), nota({ id: '2', title: 'Compras' })]);
    render(<NotesPanel />);

    fireEvent.click(await screen.findByLabelText('apagar Ideias'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Ideias' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Compras' })).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('não apaga se você desistir', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    responder([nota({ id: '1', title: 'Ideias' })]);
    render(<NotesPanel />);

    fireEvent.click(await screen.findByLabelText('apagar Ideias'));
    expect(chamadas.some((c) => c.method === 'DELETE')).toBe(false);
    confirm.mockRestore();
  });

  it('renomeia com clique duplo', async () => {
    responder([nota({ id: '1', title: 'Ideias' })]);
    render(<NotesPanel />);

    fireEvent.doubleClick(await screen.findByRole('button', { name: 'Ideias' }));
    const campo = screen.getByLabelText('renomear Ideias');
    fireEvent.change(campo, { target: { value: 'Outro nome' } });
    fireEvent.blur(campo);

    await waitFor(() =>
      expect(chamadas.find((c) => c.method === 'PATCH')?.body).toEqual({ title: 'Outro nome' }),
    );
  });

  it('mostra o erro que o servidor devolveu ao salvar', async () => {
    responder([nota({ id: '1', title: 'Ideias' })]);
    render(<NotesPanel />);
    await screen.findByLabelText('texto de Ideias');

    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'a nota aceita até 100000 caracteres' }), {
        status: 400,
      }),
    );
    fireEvent.change(screen.getByLabelText('texto de Ideias'), { target: { value: 'demais' } });
    await vi.advanceTimersByTimeAsync(800);

    expect(await screen.findByRole('alert')).toHaveTextContent(/100000 caracteres/);
  });
});
