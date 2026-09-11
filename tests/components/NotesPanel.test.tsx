import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
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

function responder(notas: Note[], sync?: object) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      chamadas.push({ url, method, body });

      if (url === '/api/notes' && method === 'GET') {
        return new Response(JSON.stringify({ notes: notas, sync }));
      }
      if (url === '/api/notes/sync') return new Response(JSON.stringify({ sync }));
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

  describe('Markdown', () => {
    /** Seleciona um trecho do campo, como o mouse faria. */
    function selecionar(campo: HTMLTextAreaElement, inicio: number, fim: number) {
      campo.focus();
      campo.setSelectionRange(inicio, fim);
    }

    it('o botão de negrito formata a seleção e grava', async () => {
      responder([nota({ id: '1', title: 'Ideias', body: 'um dois' })]);
      render(<NotesPanel />);
      const campo = (await screen.findByLabelText('texto de Ideias')) as HTMLTextAreaElement;

      selecionar(campo, 3, 7);
      fireEvent.click(screen.getByRole('button', { name: /Negrito/ }));

      expect(campo).toHaveValue('um **dois**');
      expect([campo.selectionStart, campo.selectionEnd]).toEqual([5, 9]);
      await vi.advanceTimersByTimeAsync(800);
      await waitFor(() =>
        expect(chamadas.find((c) => c.method === 'PATCH')?.body).toEqual({ body: 'um **dois**' }),
      );
    });

    it('Ctrl+B e Ctrl+K formatam pelo teclado', async () => {
      responder([nota({ id: '1', title: 'Ideias', body: 'abc' })]);
      render(<NotesPanel />);
      const campo = (await screen.findByLabelText('texto de Ideias')) as HTMLTextAreaElement;

      selecionar(campo, 0, 3);
      fireEvent.keyDown(campo, { key: 'b', ctrlKey: true });
      expect(campo).toHaveValue('**abc**');

      selecionar(campo, 2, 5);
      fireEvent.keyDown(campo, { key: 'k', metaKey: true });
      expect(campo).toHaveValue('**[abc](https://)**');
    });

    it('Enter numa lista abre o próximo item', async () => {
      responder([nota({ id: '1', title: 'Ideias', body: '- [ ] pão' })]);
      render(<NotesPanel />);
      const campo = (await screen.findByLabelText('texto de Ideias')) as HTMLTextAreaElement;

      selecionar(campo, 9, 9);
      fireEvent.keyDown(campo, { key: 'Enter' });

      expect(campo).toHaveValue('- [ ] pão\n- [ ] ');
    });

    it('Shift+Enter numa lista é uma quebra comum', async () => {
      responder([nota({ id: '1', title: 'Ideias', body: '- pão' })]);
      render(<NotesPanel />);
      const campo = (await screen.findByLabelText('texto de Ideias')) as HTMLTextAreaElement;

      selecionar(campo, 5, 5);
      fireEvent.keyDown(campo, { key: 'Enter', shiftKey: true });

      expect(campo).toHaveValue('- pão');
    });

    it('visualizar mostra o Markdown renderizado, e editar volta ao texto', async () => {
      responder([nota({ id: '1', title: 'Ideias', body: '# Plano\n\n- [x] feito\n\n<script>alert(1)</script>' })]);
      render(<NotesPanel />);
      await screen.findByLabelText('texto de Ideias');

      fireEvent.click(screen.getByRole('button', { name: 'Visualizar' }));

      const leitura = screen.getByRole('region', { name: 'visualização de Ideias' });
      expect(leitura.querySelector('h1')).toHaveTextContent('Plano');
      expect(leitura.querySelector('input[type="checkbox"]')).toBeChecked();
      expect(leitura.querySelector('script')).toBeNull();
      expect(screen.queryByLabelText('texto de Ideias')).toBeNull();
      expect(screen.getByRole('button', { name: /Negrito/ })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
      expect(screen.getByLabelText('texto de Ideias')).toHaveValue(
        '# Plano\n\n- [x] feito\n\n<script>alert(1)</script>',
      );
    });
  });

  describe('cópia no Drive', () => {
    it('sem Drive conectado, não fala em Drive', async () => {
      responder([nota({ id: '1', title: 'Ideias' })], { connected: false, pending: 0, lastError: null });
      render(<NotesPanel />);
      await screen.findByLabelText('texto de Ideias');
      expect(screen.getByRole('status')).toHaveTextContent('salvo');
      expect(screen.getByRole('status')).not.toHaveTextContent(/Drive/);
    });

    it('conectado e em dia, diz que está no Drive', async () => {
      responder([nota({ id: '1', title: 'Ideias' })], { connected: true, pending: 0, lastError: null });
      render(<NotesPanel />);
      await screen.findByLabelText('texto de Ideias');
      expect(screen.getByRole('status')).toHaveTextContent('no Google Drive');
    });

    it('com falha, mostra o motivo', async () => {
      responder([nota({ id: '1', title: 'Ideias' })], {
        connected: true,
        pending: 2,
        lastError: 'o Google recusou o acesso ao Drive — conecte de novo',
      });
      render(<NotesPanel />);
      await screen.findByLabelText('texto de Ideias');
      expect(screen.getByRole('status')).toHaveTextContent(/conecte de novo/);
    });

    it('relê a situação da cópia enquanto a tela está aberta', async () => {
      responder([nota({ id: '1', title: 'Ideias' })], { connected: true, pending: 1, lastError: null });
      render(<NotesPanel />);
      await screen.findByLabelText('texto de Ideias');
      expect(screen.getByRole('status')).toHaveTextContent('enviando ao Drive');

      await vi.advanceTimersByTimeAsync(10_500);
      expect(chamadas.some((c) => c.url === '/api/notes/sync')).toBe(true);
    });
  });

  describe('renomear', () => {
    it('o lápis abre o título para edição e Enter grava', async () => {
      responder([nota({ id: '1', title: 'Ideias' })]);
      render(<NotesPanel />);

      fireEvent.click(await screen.findByRole('button', { name: 'mudar o título de Ideias' }));
      const campo = screen.getByLabelText('renomear Ideias');
      expect(campo).toHaveFocus();
      fireEvent.change(campo, { target: { value: '  Planos  ' } });
      fireEvent.keyDown(campo, { key: 'Enter' });
      fireEvent.blur(campo);

      await waitFor(() =>
        expect(chamadas.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([
          { title: 'Planos' },
        ]),
      );
      expect(await screen.findByRole('button', { name: 'Planos' })).toBeInTheDocument();
    });

    it('Esc cancela sem gravar', async () => {
      responder([nota({ id: '1', title: 'Ideias' })]);
      render(<NotesPanel />);

      fireEvent.doubleClick(await screen.findByRole('button', { name: 'Ideias' }));
      const campo = screen.getByLabelText('renomear Ideias');
      fireEvent.change(campo, { target: { value: 'Descartado' } });
      fireEvent.keyDown(campo, { key: 'Escape' });
      fireEvent.blur(campo);

      await vi.advanceTimersByTimeAsync(800);
      expect(chamadas.some((c) => c.method === 'PATCH')).toBe(false);
      expect(screen.getByRole('button', { name: 'Ideias' })).toBeInTheDocument();
    });

    it('título vazio volta ao nome que era', async () => {
      responder([nota({ id: '1', title: 'Ideias' })]);
      render(<NotesPanel />);

      fireEvent.click(await screen.findByRole('button', { name: 'mudar o título de Ideias' }));
      const campo = screen.getByLabelText('renomear Ideias');
      fireEvent.change(campo, { target: { value: '   ' } });
      fireEvent.keyDown(campo, { key: 'Enter' });
      fireEvent.blur(campo);

      await vi.advanceTimersByTimeAsync(800);
      expect(chamadas.some((c) => c.method === 'PATCH')).toBe(false);
      expect(screen.getByRole('button', { name: 'Ideias' })).toBeInTheDocument();
    });

    it('depois de cancelar, a próxima edição grava normalmente', async () => {
      responder([nota({ id: '1', title: 'Ideias' })]);
      render(<NotesPanel />);

      fireEvent.click(await screen.findByRole('button', { name: 'mudar o título de Ideias' }));
      fireEvent.keyDown(screen.getByLabelText('renomear Ideias'), { key: 'Escape' });

      fireEvent.doubleClick(screen.getByRole('button', { name: 'Ideias' }));
      const campo = screen.getByLabelText('renomear Ideias');
      fireEvent.change(campo, { target: { value: 'Agora sim' } });
      fireEvent.blur(campo);

      await waitFor(() =>
        expect(chamadas.find((c) => c.method === 'PATCH')?.body).toEqual({ title: 'Agora sim' }),
      );
    });
  });

  describe('tela cheia', () => {
    it('maximizar abre a nota num diálogo, com editor e barra', async () => {
      responder([nota({ id: '1', title: 'Ideias', body: 'texto' })]);
      render(<NotesPanel />);
      await screen.findByLabelText('texto de Ideias');

      fireEvent.click(screen.getByRole('button', { name: 'Maximizar' }));

      const dialogo = await screen.findByRole('dialog', { name: 'Ideias' });
      expect(within(dialogo).getByLabelText('texto de Ideias')).toHaveValue('texto');
      await waitFor(() => expect(within(dialogo).getByLabelText('texto de Ideias')).toHaveFocus());
      expect(within(dialogo).getByRole('button', { name: /Negrito/ })).toBeEnabled();
      // O painel não mantém um segundo campo com o mesmo texto por baixo.
      expect(screen.getAllByLabelText('texto de Ideias')).toHaveLength(1);
      expect(screen.getByText('Aberta em tela cheia.')).toBeInTheDocument();
    });

    it('o que se digita em tela cheia é salvo e continua no painel', async () => {
      responder([nota({ id: '1', title: 'Ideias', body: '' })]);
      render(<NotesPanel />);
      await screen.findByLabelText('texto de Ideias');

      fireEvent.click(screen.getByRole('button', { name: 'Maximizar' }));
      const dialogo = await screen.findByRole('dialog');
      fireEvent.change(within(dialogo).getByLabelText('texto de Ideias'), {
        target: { value: 'escrito grande' },
      });
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Restaurar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByLabelText('texto de Ideias')).toHaveValue('escrito grande');
      await waitFor(() =>
        expect(chamadas.find((c) => c.method === 'PATCH')?.body).toEqual({ body: 'escrito grande' }),
      );
    });

    it('Esc fecha a tela cheia e volta ao painel', async () => {
      responder([nota({ id: '1', title: 'Ideias', body: 'texto' })]);
      render(<NotesPanel />);
      await screen.findByLabelText('texto de Ideias');

      fireEvent.click(screen.getByRole('button', { name: 'Maximizar' }));
      const dialogo = await screen.findByRole('dialog');
      fireEvent.keyDown(within(dialogo).getByLabelText('texto de Ideias'), { key: 'Escape' });

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      const campo = screen.getByLabelText('texto de Ideias') as HTMLTextAreaElement;
      expect(campo).toHaveValue('texto');
      expect(campo).toHaveFocus();
      expect(screen.queryByText('Aberta em tela cheia.')).toBeNull();

      // A barra do painel volta a formatar o campo do painel.
      campo.setSelectionRange(0, 5);
      fireEvent.click(screen.getByRole('button', { name: /Negrito/ }));
      expect(campo).toHaveValue('**texto**');
    });

    it('a visualização também abre em tela cheia', async () => {
      responder([nota({ id: '1', title: 'Ideias', body: '# Grande' })]);
      render(<NotesPanel />);
      await screen.findByLabelText('texto de Ideias');

      fireEvent.click(screen.getByRole('button', { name: 'Visualizar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Maximizar' }));

      const dialogo = await screen.findByRole('dialog');
      expect(within(dialogo).getByRole('region').querySelector('h1')).toHaveTextContent('Grande');
    });
  });
});
