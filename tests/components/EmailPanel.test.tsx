import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { EmailPanel } from '@/components/EmailPanel';
import type { EmailEnvelope, MailboxRef } from '@/lib/types';

// Contas deixaram de ser 'work'/'personal' fixos: cada caixa é uma conexão
// com id próprio e o nome que a pessoa escolheu.
const MAILBOXES: MailboxRef[] = [
  { id: 'mail-1', label: 'Trabalho' },
  { id: 'mail-2', label: 'Pessoal' },
];

const items: EmailEnvelope[] = [
  {
    id: '1',
    account: 'mail-1',
    accountLabel: 'Trabalho',
    from: 'Milton Yoshida',
    subject: 'Revisão do PR',
    unread: true,
    date: '2026-08-25T10:00:00Z',
    messageId: '<a@x>',
  },
  {
    id: '2',
    account: 'mail-2',
    accountLabel: 'Pessoal',
    from: 'GitHub',
    subject: 'Token adicionado',
    unread: false,
    date: '2026-08-24T10:00:00Z',
    messageId: '<b@x>',
  },
];

// Um Response só pode ter o corpo lido uma vez: cada chamada precisa de uma
// instância nova, senão a segunda leitura estoura "Body has already been read".
beforeEach(() => {
  vi.spyOn(global, 'fetch').mockImplementation(async () =>
    new Response(JSON.stringify({ folders: [] })),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EmailPanel', () => {
  it('lista os e-mails com assunto e remetente', () => {
    render(<EmailPanel onSeenChanged={() => {}} onRemoved={() => {}} mailboxes={MAILBOXES} email={{ data: items, error: null }} onChanged={() => {}} />);
    expect(screen.getByText('Revisão do PR')).toBeInTheDocument();
    expect(screen.getByText('Milton Yoshida')).toBeInTheDocument();
  });

  it('filtra por busca textual sem chamar a API', () => {
    render(<EmailPanel onSeenChanged={() => {}} onRemoved={() => {}} mailboxes={MAILBOXES} email={{ data: items, error: null }} onChanged={() => {}} />);
    const before = vi.mocked(global.fetch).mock.calls.length;
    fireEvent.change(screen.getByLabelText('buscar e-mails'), { target: { value: 'token' } });
    expect(screen.queryByText('Revisão do PR')).toBeNull();
    expect(screen.getByText('Token adicionado')).toBeInTheDocument();
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(before);
  });

  it('filtra por não lidos e mostra o contador de resultados', () => {
    render(<EmailPanel onSeenChanged={() => {}} onRemoved={() => {}} mailboxes={MAILBOXES} email={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Não lidos' }));
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
    expect(screen.queryByText('Token adicionado')).toBeNull();
  });

  it('remove um filtro ativo pelo chip', () => {
    render(<EmailPanel onSeenChanged={() => {}} onRemoved={() => {}} mailboxes={MAILBOXES} email={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Não lidos' }));
    fireEvent.click(screen.getByRole('button', { name: 'remover filtro Não lidos' }));
    expect(screen.getByText('Token adicionado')).toBeInTheDocument();
  });

  it('mostra o estado vazio quando o filtro não acha nada', () => {
    render(<EmailPanel onSeenChanged={() => {}} onRemoved={() => {}} mailboxes={MAILBOXES} email={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('buscar e-mails'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/nenhum e-mail/i)).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<EmailPanel onSeenChanged={() => {}} onRemoved={() => {}} mailboxes={MAILBOXES} email={{ data: null, error: 'himalaya falhou' }} onChanged={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('himalaya falhou');
  });

  it('marca em lote e reseleciona só os que falharam', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/email/batch')) {
        return new Response(
          JSON.stringify({ results: [{ account: 'work', id: '1', ok: false, error: 'x' }] }),
        );
      }
      return new Response(JSON.stringify({ folders: [] }));
    });
    const onChanged = vi.fn();
    render(<EmailPanel onSeenChanged={() => {}} onRemoved={() => {}} mailboxes={MAILBOXES} email={{ data: items, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText('selecionar Revisão do PR'));
    fireEvent.click(screen.getByRole('button', { name: 'Marcar lido' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('falharam'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('abre o e-mail no acordeão em vez de um diálogo', async () => {
    render(<EmailPanel onSeenChanged={() => {}} onRemoved={() => {}} mailboxes={MAILBOXES} email={{ data: items, error: null }} onChanged={() => {}} />);
    const row = screen.getByRole('button', { name: /^Revisão do PR/ });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByLabelText('corpo do e-mail')).toBeInTheDocument());
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('gera o rascunho com IA e envia a resposta', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/email/reply/draft')) {
        return new Response(JSON.stringify({ text: 'Perfeito, revisado.' }));
      }
      if (url.includes('/api/email/reply')) return new Response(JSON.stringify({ ok: true }));
      if (url.includes('/body')) return new Response(JSON.stringify({ text: 'corpo' }));
      return new Response(JSON.stringify({ folders: [] }));
    });
    const onChanged = vi.fn();
    render(<EmailPanel onSeenChanged={() => {}} onRemoved={() => {}} mailboxes={MAILBOXES} email={{ data: items, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /^Revisão do PR/ }));

    const send = await screen.findByRole('button', { name: 'Enviar resposta' });
    expect(send).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Responder com IA' }));
    await waitFor(() =>
      expect(screen.getByLabelText('resposta')).toHaveValue('Perfeito, revisado.'),
    );
    expect(send).toBeEnabled();

    fireEvent.click(send);
    await waitFor(() => expect(screen.getByText('Resposta enviada.')).toBeInTheDocument());
    expect(screen.getByLabelText('resposta')).toHaveValue('');
  });

  it('mostra o erro quando a geração com IA falha', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/email/reply/draft')) {
        return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY não configurada' }), {
          status: 503,
        });
      }
      if (url.includes('/body')) return new Response(JSON.stringify({ text: 'corpo' }));
      return new Response(JSON.stringify({ folders: [] }));
    });
    render(<EmailPanel onSeenChanged={() => {}} onRemoved={() => {}} mailboxes={MAILBOXES} email={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^Revisão do PR/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Responder com IA' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('ANTHROPIC_API_KEY'),
    );
  });

  it('etiqueta pelo ícone da linha, sem abrir o e-mail', async () => {
    const calls: string[] = [];
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/email/tag')) {
        calls.push(String((init as RequestInit).body));
        return new Response(JSON.stringify({ ok: true }));
      }
      return new Response(JSON.stringify({ folders: ['Financeiro', 'Recibos'] }));
    });
    const onChanged = vi.fn();
    render(<EmailPanel onSeenChanged={() => {}} onRemoved={() => {}} mailboxes={MAILBOXES} email={{ data: items, error: null }} onChanged={onChanged} />);

    const tagger = screen.getByRole('button', { name: 'etiquetar Revisão do PR' });
    expect(tagger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(tagger);

    const option = await screen.findByRole('menuitem', { name: 'Recibos' });
    fireEvent.click(option);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(calls[0])).toEqual({ account: 'mail-1', id: '1', tag: 'Recibos' });
    // O menu fecha e o corpo do e-mail nunca é carregado.
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(screen.queryByLabelText('corpo do e-mail')).toBeNull();
    expect(onChanged).toHaveBeenCalled();
  });

  it('o e-mail aberto não traz mais os botões Etiquetar, Excluir e Fechar', async () => {
    render(<EmailPanel onSeenChanged={() => {}} onRemoved={() => {}} mailboxes={MAILBOXES} email={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^Revisão do PR/ }));
    await waitFor(() => expect(screen.getByLabelText('corpo do e-mail')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Etiquetar' })).toBeNull();
    expect(screen.queryByLabelText('etiqueta')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull();
    // "Excluir" ainda existe na barra de ações em lote, mas não dentro do e-mail.
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull();
  });

  it('exclui pela lixeira da linha, depois de confirmar', async () => {
    const bodies: string[] = [];
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/email/batch')) {
        bodies.push(String((init as RequestInit).body));
        return new Response(JSON.stringify({ results: [{ account: 'work', id: '1', ok: true }] }));
      }
      return new Response(JSON.stringify({ folders: [] }));
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onRemoved = vi.fn();
    render(
      <EmailPanel
        onSeenChanged={() => {}}
        onRemoved={onRemoved}
        mailboxes={MAILBOXES}
        email={{ data: items, error: null }}
        onChanged={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'excluir Revisão do PR' }));

    // A linha sai da tela antes de a ida ao IMAP terminar.
    expect(onRemoved).toHaveBeenCalledWith([{ account: 'mail-1', id: '1' }]);

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(JSON.parse(bodies[0])).toEqual({
      targets: [{ account: 'mail-1', id: '1' }],
      action: 'delete',
    });
    expect(confirmSpy).toHaveBeenCalled();
  });

  it('cancelar a confirmação não exclui nada', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EmailPanel onSeenChanged={() => {}} onRemoved={() => {}} mailboxes={MAILBOXES} email={{ data: items, error: null }} onChanged={() => {}} />);
    const before = vi.mocked(global.fetch).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'excluir Revisão do PR' }));
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(before);
  });
});

describe('seleção por intervalo com Shift', () => {
  const cinco: EmailEnvelope[] = Array.from({ length: 5 }, (_, i) => ({
    id: String(i + 1),
    account: 'mail-1',
    accountLabel: 'Trabalho',
    from: 'Alguém',
    subject: `Mensagem ${i + 1}`,
    unread: false,
    date: `2026-08-2${5 - i}T10:00:00Z`,
    messageId: `<${i}@x>`,
  }));

  const caixa = (n: number) =>
    screen.getByLabelText(`selecionar Mensagem ${n}`) as HTMLInputElement;

  function montar() {
    render(
      <EmailPanel
        onSeenChanged={() => {}}
        onRemoved={() => {}}
        mailboxes={MAILBOXES}
        email={{ data: cinco, error: null }}
        onChanged={() => {}}
      />,
    );
  }

  it('marca do último clicado até o alvo, como no Gmail', () => {
    montar();
    fireEvent.click(caixa(2));
    fireEvent.click(caixa(4), { shiftKey: true });

    expect(caixa(1).checked).toBe(false);
    expect(caixa(2).checked).toBe(true);
    expect(caixa(3).checked).toBe(true);
    expect(caixa(4).checked).toBe(true);
    expect(caixa(5).checked).toBe(false);
  });

  it('funciona de baixo para cima', () => {
    montar();
    fireEvent.click(caixa(4));
    fireEvent.click(caixa(2), { shiftKey: true });

    expect(caixa(2).checked).toBe(true);
    expect(caixa(3).checked).toBe(true);
    expect(caixa(4).checked).toBe(true);
    expect(caixa(1).checked).toBe(false);
  });

  // O intervalo assume o estado do alvo: se o alvo ia ser desmarcado, a
  // faixa toda é desmarcada.
  it('desmarca a faixa quando o alvo já estava marcado', () => {
    montar();
    fireEvent.click(caixa(1));
    fireEvent.click(caixa(4), { shiftKey: true });
    expect(caixa(3).checked).toBe(true);

    // A âncora agora é o 4, então a faixa desmarcada é 3–4; o 2, fora dela,
    // continua marcado.
    fireEvent.click(caixa(3), { shiftKey: true });
    expect(caixa(3).checked).toBe(false);
    expect(caixa(4).checked).toBe(false);
    expect(caixa(2).checked).toBe(true);
  });

  it('sem âncora, o Shift marca só o item clicado', () => {
    montar();
    fireEvent.click(caixa(3), { shiftKey: true });
    expect(caixa(3).checked).toBe(true);
    expect(caixa(1).checked).toBe(false);
    expect(caixa(5).checked).toBe(false);
  });

  it('a âncora anda, permitindo intervalos encadeados', () => {
    montar();
    fireEvent.click(caixa(1));
    fireEvent.click(caixa(2), { shiftKey: true });
    fireEvent.click(caixa(4), { shiftKey: true });
    expect(caixa(3).checked).toBe(true);
    expect(caixa(4).checked).toBe(true);
  });

  it('clique sem Shift continua alternando um só', () => {
    montar();
    fireEvent.click(caixa(2));
    fireEvent.click(caixa(4));
    expect(caixa(3).checked).toBe(false);
    expect(caixa(2).checked).toBe(true);
    expect(caixa(4).checked).toBe(true);
  });
});
