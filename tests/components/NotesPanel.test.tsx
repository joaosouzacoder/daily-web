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
    markdown: false,
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

  it('apaga a aba depois de confirmar no diálogo', async () => {
    responder([nota({ id: '1', title: 'Ideias' }), nota({ id: '2', title: 'Compras' })]);
    render(<NotesPanel />);

    fireEvent.click(await screen.findByLabelText('apagar Ideias'));
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Ideias' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Compras' })).toBeInTheDocument();
  });

  it('não apaga se você cancelar no diálogo', async () => {
    responder([nota({ id: '1', title: 'Ideias' })]);
    render(<NotesPanel />);

    fireEvent.click(await screen.findByLabelText('apagar Ideias'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(chamadas.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('Enter no diálogo confirma sem precisar do mouse', async () => {
    responder([nota({ id: '1', title: 'Ideias' }), nota({ id: '2', title: 'Compras' })]);
    render(<NotesPanel />);

    fireEvent.click(await screen.findByLabelText('apagar Ideias'));
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Enter' });

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Ideias' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Compras' })).toBeInTheDocument();
  });

  it('Escape no diálogo desiste sem apagar', async () => {
    responder([nota({ id: '1', title: 'Ideias' })]);
    render(<NotesPanel />);

    fireEvent.click(await screen.findByLabelText('apagar Ideias'));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.keyDown(dialogo, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(chamadas.some((c) => c.method === 'DELETE')).toBe(false);
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

// A nota guarda se abre formatada, e o toggle é dela, não do painel: uma aba
// de rascunho corrido e outra de anotação estruturada querem coisas
// diferentes.
describe('Markdown na nota', () => {
  it('a nota crua mostra os sinais no campo de texto', async () => {
    responder([nota({ body: '# Título', markdown: false })]);
    render(<NotesPanel />);

    expect(await screen.findByLabelText('texto de Ideias')).toHaveValue('# Título');
    expect(screen.queryByRole('heading', { name: 'Título' })).toBeNull();
  });

  it('a nota com Markdown ligado abre formatada', async () => {
    // Duas linhas: o cursor começa na primeira, então é a segunda que mostra
    // como fica uma linha sem o cursor.
    responder([nota({ body: 'antes\n# Título', markdown: true })]);
    render(<NotesPanel />);

    const superficie = await screen.findByRole('textbox', { name: 'texto de Ideias' });
    const titulo = superficie.querySelector('[data-linha="1"]');
    // O sinal saiu da tela e o tamanho de título ficou.
    expect(titulo?.textContent).toBe('Título');
    expect(titulo?.querySelector('.md-h1')).toBeInTheDocument();
  });

  it('o chip diz o estado atual da nota', async () => {
    responder([nota({ markdown: true })]);
    render(<NotesPanel />);

    expect(await screen.findByRole('button', { name: 'Markdown' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('clicar no chip grava a escolha no servidor', async () => {
    responder([nota({ id: 'n1', markdown: false })]);
    render(<NotesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Markdown' }));

    await waitFor(() =>
      expect(chamadas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ method: 'PATCH', body: { markdown: true } }),
        ]),
      ),
    );
  });

  // Desligar precisa devolver o texto cru, com os sinais à vista: é a forma de
  // corrigir o que a formatação esconde.
  it('desligar volta ao textarea, com os sinais à vista', async () => {
    responder([nota({ id: 'n1', body: '# Título', markdown: true })]);
    render(<NotesPanel />);
    // Com Markdown ligado a superfície é editável, não é um textarea.
    expect((await screen.findByLabelText('texto de Ideias')).tagName).toBe('DIV');

    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));

    // A superfície e o textarea têm o mesmo rótulo, então esperar por "existe"
    // devolveria a superfície antiga: o que se espera é a troca do elemento.
    await waitFor(() =>
      expect(screen.getByLabelText('texto de Ideias').tagName).toBe('TEXTAREA'),
    );
    expect(screen.getByLabelText('texto de Ideias')).toHaveValue('# Título');
  });
});
