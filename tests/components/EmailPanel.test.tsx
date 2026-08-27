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
    references: [],
    mailbox: 'inbox' as const,
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
    references: [],
    mailbox: 'inbox' as const,
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
      if (url.includes('/api/email/batch')) {
        calls.push(String((init as RequestInit).body));
        return new Response(JSON.stringify({ results: [{ account: 'mail-1', id: '1', ok: true }] }));
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
    // Etiquetar vai pelo lote: uma conversa pode ter várias mensagens, e é
    // uma conexão IMAP só para todas elas.
    expect(JSON.parse(calls[0])).toEqual({
      targets: [{ account: 'mail-1', id: '1' }],
      action: 'move',
      folder: 'Recibos',
    });
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
    references: [],
    mailbox: 'inbox' as const,
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

describe('conversas', () => {
  const fio: EmailEnvelope[] = [
    // A que você mandou vive na pasta de enviados, não na entrada.
    {
      id: '10', account: 'mail-1', accountLabel: 'Work', from: 'você',
      subject: 'teste assunto', unread: false, date: '2026-08-27T12:11:00Z',
      messageId: '<a@x>', references: [], mailbox: 'sent',
    },
    {
      id: '11', account: 'mail-1', accountLabel: 'Work', from: 'Luan',
      subject: 'Re: teste assunto', unread: true, date: '2026-08-27T14:55:00Z',
      messageId: '<b@x>', references: ['<a@x>'], mailbox: 'inbox',
    },
    {
      id: '12', account: 'mail-1', accountLabel: 'Work', from: 'Luan',
      subject: 'Re: teste assunto', unread: true, date: '2026-08-27T15:02:00Z',
      messageId: '<c@x>', references: ['<a@x>', '<b@x>'], mailbox: 'inbox',
    },
    {
      id: '20', account: 'mail-1', accountLabel: 'Work', from: 'Nubank',
      subject: 'Cobranças recorrentes', unread: true, date: '2026-08-27T13:00:00Z',
      messageId: '<n@x>', references: [], mailbox: 'inbox',
    },
  ];

  function montar(onChanged = () => {}) {
    render(
      <EmailPanel
        onSeenChanged={() => {}}
        onRemoved={() => {}}
        mailboxes={MAILBOXES}
        email={{ data: fio, error: null }}
        onChanged={onChanged}
      />,
    );
  }

  it('mostra uma linha por conversa, com o assunto sem "Re:"', () => {
    montar();
    expect(screen.getByText('teste assunto')).toBeInTheDocument();
    expect(screen.queryByText('Re: teste assunto')).toBeNull();
    expect(screen.getByText('Cobranças recorrentes')).toBeInTheDocument();
  });

  it('mostra quem participou e quantas mensagens são', () => {
    montar();
    expect(screen.getByText('você, Luan')).toBeInTheDocument();
    expect(screen.getByLabelText('3 mensagens, 1 enviadas por você')).toHaveTextContent('3');
  });

  it('não põe contagem na conversa de uma mensagem só', () => {
    montar();
    expect(screen.queryByLabelText('1 mensagens')).toBeNull();
  });

  it('abre a conversa e lista as mensagens em ordem', () => {
    montar();
    fireEvent.click(screen.getByText('teste assunto').closest('button') as HTMLElement);

    const linhas = screen
      .getAllByRole('button')
      .filter((b) => b.className.includes('thread-row'));
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toHaveTextContent('você');
    expect(linhas[2]).toHaveTextContent('Luan');
  });

  // Numa conversa de uma mensagem, expandir para clicar de novo seria um
  // passo a mais no caso mais comum da caixa.
  it('a conversa de uma mensagem abre direto no corpo', async () => {
    // Uma implementação, não um Response reaproveitado: o corpo de um Response
    // só pode ser lido uma vez, e a abertura dispara mais de uma requisição.
    vi.mocked(global.fetch).mockImplementation(
      async () => new Response(JSON.stringify({ text: 'corpo', quoted: '' })),
    );
    montar();
    fireEvent.click(screen.getByText('Cobranças recorrentes').closest('button') as HTMLElement);
    expect(await screen.findByLabelText('corpo do e-mail')).toBeInTheDocument();
  });

  it('marcar a conversa marca todas as mensagens dela', () => {
    montar();
    fireEvent.click(screen.getByLabelText('selecionar teste assunto'));
    // Duas: a enviada não entra nas ações, que falam com a caixa de entrada.
    expect(screen.getByText('2 selecionados')).toBeInTheDocument();
  });

  it('a conversa aparece como não lida quando qualquer mensagem está', () => {
    montar();
    const linha = screen.getByText('teste assunto').closest('.row');
    expect(linha?.className).toContain('row-unread');
  });

  it('excluir a conversa avisa quantas mensagens vão junto', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    montar();
    fireEvent.click(screen.getByLabelText('excluir teste assunto'));
    // Duas recebidas; a enviada não é lixo da caixa de entrada.
    expect(confirm).toHaveBeenCalledWith('Excluir esta conversa (2 mensagens recebidas)?');
    confirm.mockRestore();
  });

  it('excluir uma conversa de uma mensagem pergunta no singular', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    montar();
    fireEvent.click(screen.getByLabelText('excluir Cobranças recorrentes'));
    expect(confirm).toHaveBeenCalledWith('Excluir este e-mail?');
    confirm.mockRestore();
  });

  // A busca filtra mensagens; a conversa se remonta com o que sobrou, em vez
  // de trazer o fio inteiro de volta.
  it('a busca não ressuscita as mensagens que ela filtrou', () => {
    montar();
    fireEvent.change(screen.getByLabelText('buscar e-mails'), { target: { value: 'Nubank' } });
    expect(screen.getByText('Cobranças recorrentes')).toBeInTheDocument();
    expect(screen.queryByText('teste assunto')).toBeNull();
  });
});

describe('mensagens enviadas na conversa', () => {
  const enviadaSozinha: EmailEnvelope[] = [
    {
      id: '30', account: 'mail-1', accountLabel: 'Work', from: 'você',
      subject: 'Proposta', unread: false, date: '2026-08-27T09:00:00Z',
      messageId: '<p@x>', references: [], mailbox: 'sent',
    },
  ];

  function montarCom(data: EmailEnvelope[]) {
    render(
      <EmailPanel
        onSeenChanged={() => {}}
        onRemoved={() => {}}
        mailboxes={MAILBOXES}
        email={{ data, error: null }}
        onChanged={() => {}}
      />,
    );
  }

  // Era o que estava faltando: o fio mostrava só o lado de quem escreveu
  // para você, e a sua própria mensagem não aparecia.
  it('a mensagem que você mandou aparece dentro da conversa', () => {
    montarCom(fioComEnviada);
    fireEvent.click(screen.getByText('Proposta').closest('button') as HTMLElement);

    const linhas = screen.getAllByRole('button').filter((b) => b.className.includes('thread-row'));
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toHaveTextContent('você');
    expect(linhas[0]).toHaveTextContent('enviada');
    expect(linhas[1]).toHaveTextContent('Cliente');
  });

  // A caixa de entrada é a caixa de entrada: um e-mail que você mandou e
  // ninguém respondeu não vira linha nela.
  it('não mostra a conversa que só tem mensagem enviada', () => {
    montarCom(enviadaSozinha);
    expect(screen.queryByText('Proposta')).toBeNull();
  });

  it('a enviada não entra na seleção nem nas ações', () => {
    montarCom(fioComEnviada);
    fireEvent.click(screen.getByLabelText('selecionar Proposta'));
    expect(screen.getByText('1 selecionados')).toBeInTheDocument();
  });

  // O uid é por caixa: buscar o corpo de uma enviada dentro da entrada traria
  // outra mensagem.
  it('pede o corpo dizendo de qual caixa a mensagem é', async () => {
    const urls: string[] = [];
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ text: 'corpo', quoted: '' }));
    });
    montarCom(fioComEnviada);
    fireEvent.click(screen.getByText('Proposta').closest('button') as HTMLElement);

    const enviada = screen
      .getAllByRole('button')
      .filter((b) => b.className.includes('thread-row'))[0];
    fireEvent.click(enviada);

    await waitFor(() => expect(urls.some((u) => u.includes('/body?box=sent'))).toBe(true));
  });

  // Responder ao próprio e-mail enviado não faz sentido, e a rota de resposta
  // busca a mensagem na entrada.
  it('não oferece responder numa mensagem enviada', async () => {
    vi.mocked(global.fetch).mockImplementation(
      async () => new Response(JSON.stringify({ text: 'corpo', quoted: '' })),
    );
    montarCom(fioComEnviada);
    fireEvent.click(screen.getByText('Proposta').closest('button') as HTMLElement);

    const linhas = screen.getAllByRole('button').filter((b) => b.className.includes('thread-row'));
    fireEvent.click(linhas[0]);
    await screen.findByLabelText('corpo do e-mail');
    expect(screen.queryByLabelText('resposta')).toBeNull();

    fireEvent.click(linhas[1]);
    await screen.findByLabelText('corpo do e-mail');
    expect(screen.getByLabelText('resposta')).toBeInTheDocument();
  });
});

const fioComEnviada: EmailEnvelope[] = [
  {
    id: '30', account: 'mail-1', accountLabel: 'Work', from: 'você',
    subject: 'Proposta', unread: false, date: '2026-08-27T09:00:00Z',
    messageId: '<p@x>', references: [], mailbox: 'sent',
  },
  {
    id: '31', account: 'mail-1', accountLabel: 'Work', from: 'Cliente',
    subject: 'Re: Proposta', unread: true, date: '2026-08-27T10:00:00Z',
    messageId: '<q@x>', references: ['<p@x>'], mailbox: 'inbox',
  },
];
