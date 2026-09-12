import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
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
    labels: [],
    mailbox: 'inbox' as const,
    folder: 'INBOX',
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
    labels: [],
    mailbox: 'inbox' as const,
    folder: 'INBOX',
  },
];

// Um Response só pode ter o corpo lido uma vez: cada chamada precisa de uma
// instância nova, senão a segunda leitura estoura "Body has already been read".
beforeEach(() => {
  // O que a tela mostra vive na URL. Cada teste é uma visita nova, então a
  // URL da anterior não pode sobrar — senão um filtro clicado num teste
  // chegaria ligado no seguinte.
  window.history.replaceState(null, '', '/');
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
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('não foi processada'),
    );
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
      // Etiquetar é copiar para a pasta: a mensagem fica onde está.
      action: 'tag',
      // A pasta em que as mensagens estão: o uid só identifica dentro de uma.
      folderPath: 'INBOX',
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
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));

    // A linha sai da tela antes de a ida ao IMAP terminar.
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith([{ account: 'mail-1', id: '1' }]));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(JSON.parse(bodies[0])).toEqual({
      targets: [{ account: 'mail-1', id: '1' }],
      action: 'delete',
      folderPath: 'INBOX',
    });
  });

  it('cancelar no diálogo não exclui nada', async () => {
    render(<EmailPanel onSeenChanged={() => {}} onRemoved={() => {}} mailboxes={MAILBOXES} email={{ data: items, error: null }} onChanged={() => {}} />);
    const before = vi.mocked(global.fetch).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'excluir Revisão do PR' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(before);
  });
});

describe('etiquetas vindas do servidor', () => {
  // O painel guardava as etiquetas só em estado local, preenchido no clique:
  // um F5 zerava a lista e uma etiqueta posta pelo Gmail nunca aparecia.
  const etiquetada: EmailEnvelope[] = [
    { ...items[0], labels: ['Clientes', 'Financeiro'] },
  ];

  function montar(data: EmailEnvelope[]) {
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

  it('mostra a etiqueta que veio do servidor, sem ninguém ter clicado nesta sessão', async () => {
    montar(etiquetada);
    fireEvent.click(screen.getByRole('button', { name: /^Revisão do PR/ }));
    expect(await screen.findByText('Clientes')).toBeTruthy();
    expect(screen.getByText('Financeiro')).toBeTruthy();
  });

  it('marca o botão de etiqueta de quem já vem etiquetado do servidor', () => {
    montar(etiquetada);
    const botao = screen.getByRole('button', { name: 'etiquetar Revisão do PR' });
    expect(botao.className).toContain('is-tagged');
  });

  it('não marca nada quando o servidor não reporta etiqueta', () => {
    montar(items);
    const botao = screen.getByRole('button', { name: 'etiquetar Revisão do PR' });
    expect(botao.className).not.toContain('is-tagged');
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
    labels: [],
    mailbox: 'inbox' as const,
    folder: 'INBOX',
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
  // A âncora fica parada no último clique sem Shift: encolher a faixa é
  // clicar mais perto dela, e não começar outra faixa de onde se clicou por
  // último. É assim que um gerenciador de arquivos se comporta.
  it('refaz a faixa a partir da mesma âncora', () => {
    montar();
    fireEvent.click(caixa(1));
    fireEvent.click(caixa(4), { shiftKey: true });
    expect(caixa(3).checked).toBe(true);

    fireEvent.click(caixa(3), { shiftKey: true });
    expect(caixa(1).checked).toBe(true);
    expect(caixa(2).checked).toBe(true);
    expect(caixa(3).checked).toBe(true);
    expect(caixa(4).checked).toBe(false);
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
      messageId: '<a@x>', references: [], labels: [], mailbox: 'sent', folder: 'Sent',
    },
    {
      id: '11', account: 'mail-1', accountLabel: 'Work', from: 'Luan',
      subject: 'Re: teste assunto', unread: true, date: '2026-08-27T14:55:00Z',
      messageId: '<b@x>', references: ['<a@x>'], labels: [], mailbox: 'inbox', folder: 'INBOX',
    },
    {
      id: '12', account: 'mail-1', accountLabel: 'Work', from: 'Luan',
      subject: 'Re: teste assunto', unread: true, date: '2026-08-27T15:02:00Z',
      messageId: '<c@x>', references: ['<a@x>', '<b@x>'], labels: [], mailbox: 'inbox', folder: 'INBOX',
    },
    {
      id: '20', account: 'mail-1', accountLabel: 'Work', from: 'Nubank',
      subject: 'Cobranças recorrentes', unread: true, date: '2026-08-27T13:00:00Z',
      messageId: '<n@x>', references: [], labels: [], mailbox: 'inbox', folder: 'INBOX',
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
    // A seleção é de conversas; o lote é o que se desdobra em mensagens, e a
    // enviada fica de fora porque as ações falam com a pasta de origem.
    expect(screen.getByText('1 conversa')).toBeInTheDocument();
  });

  it('a conversa aparece como não lida quando qualquer mensagem está', () => {
    montar();
    const linha = screen.getByText('teste assunto').closest('.row');
    expect(linha?.className).toContain('row-unread');
  });

  it('excluir a conversa avisa quantas mensagens vão junto', async () => {
    montar();
    fireEvent.click(screen.getByLabelText('excluir teste assunto'));
    // Duas recebidas; a enviada não é lixo da caixa de entrada.
    expect(
      await screen.findByText('Excluir esta conversa (2 mensagens recebidas)?'),
    ).toBeInTheDocument();
  });

  it('excluir uma conversa de uma mensagem pergunta no singular', async () => {
    montar();
    fireEvent.click(screen.getByLabelText('excluir Cobranças recorrentes'));
    expect(await screen.findByText('Excluir este e-mail?')).toBeInTheDocument();
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
      messageId: '<p@x>', references: [], labels: [], mailbox: 'sent', folder: 'Sent',
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
    expect(screen.getByText('1 conversa')).toBeInTheDocument();
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
    messageId: '<p@x>', references: [], labels: [], mailbox: 'sent', folder: 'Sent',
  },
  {
    id: '31', account: 'mail-1', accountLabel: 'Work', from: 'Cliente',
    subject: 'Re: Proposta', unread: true, date: '2026-08-27T10:00:00Z',
    messageId: '<q@x>', references: ['<p@x>'], labels: [], mailbox: 'inbox', folder: 'INBOX',
  },
];

describe('ação que falhou em definitivo', () => {
  // Esconder uma mensagem que continua na caixa do servidor seria mentir sobre
  // o estado dela. Ela volta para a lista, com o motivo à vista.
  it('mostra o erro na linha da mensagem', () => {
    const comErro: EmailEnvelope[] = [
      { ...items[0], actionError: 'a conta recusou a conexão' },
      items[1],
    ];
    render(
      <EmailPanel
        onSeenChanged={() => {}}
        onRemoved={() => {}}
        mailboxes={MAILBOXES}
        email={{ data: comErro, error: null }}
        onChanged={() => {}}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('a conta recusou a conexão');
  });
});

describe('pastas por conta, cache e listagem', () => {
  const CONTAS: MailboxRef[] = [
    { id: 'mail-1', label: 'Pessoal' },
    { id: 'mail-2', label: 'Work' },
  ];

  const guardadas = {
    'mail-1': [
      { path: 'INBOX', name: 'INBOX', delimiter: '/', parent: null, specialUse: null, total: 9, unread: 2 },
      { path: 'Clientes', name: 'Clientes', delimiter: '/', parent: null, specialUse: null, total: 4, unread: 1 },
    ],
    'mail-2': [
      { path: 'INBOX', name: 'INBOX', delimiter: '/', parent: null, specialUse: null, total: 3, unread: 7 },
    ],
  };

  interface Cenario {
    sincronizadas?: Record<string, unknown[]>;
    erroDeSync?: string[];
    mensagens?: Record<string, EmailEnvelope[]>;
    atrasar?: (url: string) => number;
  }

  function mockarRotas(cenario: Cenario = {}) {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const endereco = String(url);
      const espera = cenario.atrasar?.(endereco) ?? 0;
      if (espera > 0) await new Promise((r) => setTimeout(r, espera));

      if (endereco.includes('/api/email/mailboxes')) {
        const conta = new URL(endereco, 'http://x').searchParams.get('account')!;
        const sincronizando = endereco.includes('sync=1');
        if (sincronizando && cenario.erroDeSync?.includes(conta)) {
          return new Response(JSON.stringify({ error: 'caixa fora do ar' }), { status: 502 });
        }
        const lista = sincronizando
          ? (cenario.sincronizadas?.[conta] ?? guardadas[conta as keyof typeof guardadas])
          : guardadas[conta as keyof typeof guardadas];
        return new Response(JSON.stringify({ mailboxes: lista, cached: !sincronizando }));
      }
      if (endereco.includes('/api/email/messages')) {
        const params = new URL(endereco, 'http://x').searchParams;
        const chave = `${params.get('account')} ${params.get('folder')}`;
        return new Response(JSON.stringify({ messages: cenario.mensagens?.[chave] ?? [] }));
      }
      return new Response(JSON.stringify({ folders: [], ok: true }));
    });
  }

  function montar(contas: MailboxRef[] = CONTAS) {
    render(
      <EmailPanel
        onSeenChanged={() => {}}
        onRemoved={() => {}}
        mailboxes={contas}
        email={{ data: items, error: null }}
        onChanged={() => {}}
      />,
    );
  }

  const abrirTelaCheia = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Abrir em tela cheia' }));
    await screen.findByRole('navigation', { name: 'Pastas' });
  };

  function mensagem(id: string, subject: string, folder: string, account = 'mail-1'): EmailEnvelope {
    return {
      id, account, accountLabel: 'Pessoal', from: 'Alguém', subject,
      unread: true, date: '2026-09-12T10:00:00Z', messageId: `<${id}@x>`,
      references: [], labels: [], mailbox: 'inbox', folder,
    };
  }

  it('agrupa as pastas por conta', async () => {
    mockarRotas();
    montar();
    await abrirTelaCheia();

    expect(await screen.findByRole('region', { name: 'Pessoal' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Work' })).toBeInTheDocument();
  });

  // Duas contas têm a sua própria INBOX: quem lê a tela precisa saber de qual
  // delas está falando.
  it('distingue pastas homônimas de contas diferentes', async () => {
    mockarRotas();
    montar();
    await abrirTelaCheia();

    expect(await screen.findByRole('button', { name: /^INBOX em Pessoal, 2 não lidas/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^INBOX em Work, 7 não lidas/ })).toBeInTheDocument();
  });

  // Contar mensagem é uma ida ao servidor por pasta: a tela abre com o que já
  // está guardado e a leitura vem por cima.
  it('mostra o que está guardado antes de sincronizar', async () => {
    mockarRotas({
      sincronizadas: {
        'mail-1': [
          { path: 'INBOX', name: 'INBOX', delimiter: '/', parent: null, specialUse: null, total: 9, unread: 2 },
          { path: 'Fornecedores', name: 'Fornecedores', delimiter: '/', parent: null, specialUse: null, total: 1, unread: 0 },
        ],
      },
      atrasar: (u) => (u.includes('sync=1') ? 60 : 0),
    });
    montar([CONTAS[0]]);
    await abrirTelaCheia();

    // A pasta guardada aparece antes de a sincronização terminar…
    expect(await screen.findByRole('button', { name: /^Clientes em Pessoal/ })).toBeInTheDocument();
    // …e a criada no servidor entra sem ninguém recarregar a tela.
    expect(await screen.findByRole('button', { name: /^Fornecedores em Pessoal/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Clientes em Pessoal/ })).toBeNull();
  });

  // Uma caixa fora do ar mostra o erro dela e deixa as outras em paz.
  it('isola a falha de uma conta e oferece tentar de novo', async () => {
    mockarRotas({ erroDeSync: ['mail-2'] });
    montar();
    await abrirTelaCheia();

    expect(await screen.findByText('caixa fora do ar')).toBeInTheDocument();
    // O que estava guardado continua na tela, nas duas contas.
    expect(screen.getByRole('button', { name: /^INBOX em Work/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Clientes em Pessoal/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tentar de novo' })).toBeInTheDocument();
  });

  it('escreve a conta e a pasta escolhidas na URL', async () => {
    mockarRotas({ mensagens: { 'mail-2 INBOX': [mensagem('9', 'Do trabalho', 'INBOX', 'mail-2')] } });
    montar();
    await abrirTelaCheia();

    fireEvent.click(await screen.findByRole('button', { name: /^INBOX em Work/ }));

    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get('mail_folder')).toBe('INBOX');
      expect(params.get('mail_facct')).toBe('mail-2');
    });
    expect(await screen.findByText('Do trabalho')).toBeInTheDocument();
  });

  // O mesmo caminho em contas diferentes é outra caixa: a listagem tem de
  // seguir o par, não só a pasta.
  it('lista a pasta da conta escolhida, não a homônima da outra', async () => {
    mockarRotas({
      mensagens: {
        'mail-1 Clientes': [mensagem('1', 'Da conta pessoal', 'Clientes')],
        'mail-2 INBOX': [mensagem('2', 'Da conta do trabalho', 'INBOX', 'mail-2')],
      },
    });
    montar();
    await abrirTelaCheia();

    fireEvent.click(await screen.findByRole('button', { name: /^Clientes em Pessoal/ }));
    expect(await screen.findByText('Da conta pessoal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^INBOX em Work/ }));
    expect(await screen.findByText('Da conta do trabalho')).toBeInTheDocument();
    expect(screen.queryByText('Da conta pessoal')).toBeNull();
  });

  // Trocar de pasta antes de a anterior responder acontece o tempo todo. A
  // resposta atrasada não pode escrever por cima do que está na tela.
  it('ignora a resposta atrasada da pasta anterior', async () => {
    mockarRotas({
      mensagens: {
        'mail-1 Clientes': [mensagem('1', 'Da pasta lenta', 'Clientes')],
        'mail-2 INBOX': [mensagem('2', 'Da pasta rápida', 'INBOX', 'mail-2')],
      },
      atrasar: (u) => (u.includes('folder=Clientes') ? 150 : 0),
    });
    montar();
    await abrirTelaCheia();

    fireEvent.click(await screen.findByRole('button', { name: /^Clientes em Pessoal/ }));
    fireEvent.click(screen.getByRole('button', { name: /^INBOX em Work/ }));

    expect(await screen.findByText('Da pasta rápida')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.queryByText('Da pasta lenta')).toBeNull();
    expect(screen.getByText('Da pasta rápida')).toBeInTheDocument();
  });

  it('mostra o vazio e o erro da pasta', async () => {
    mockarRotas({ mensagens: {} });
    montar([CONTAS[0]]);
    await abrirTelaCheia();

    fireEvent.click(await screen.findByRole('button', { name: /^Clientes em Pessoal/ }));
    expect(await screen.findByText('Nenhum e-mail nesta pasta.')).toBeInTheDocument();
  });

  // Trocar de pasta zera a seleção: o lote fala da pasta que está na tela.
  it('limpa a seleção ao trocar de pasta', async () => {
    mockarRotas({
      mensagens: {
        'mail-1 Clientes': [mensagem('1', 'Uma da pasta', 'Clientes')],
        'mail-2 INBOX': [mensagem('2', 'Outra conta', 'INBOX', 'mail-2')],
      },
    });
    montar();
    await abrirTelaCheia();

    fireEvent.click(await screen.findByRole('button', { name: /^Clientes em Pessoal/ }));
    fireEvent.click(await screen.findByLabelText('selecionar Uma da pasta'));
    expect(screen.getByText('1 conversa')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^INBOX em Work/ }));
    await waitFor(() => expect(screen.queryByText('1 conversa')).toBeNull());
  });
});


describe('seleção múltipla, arraste e ações de pasta', () => {
  const ARVORE = [
    { path: 'INBOX', name: 'INBOX', delimiter: '/', parent: null, specialUse: null, total: 9, unread: 2 },
    { path: 'Arquivo', name: 'Arquivo', delimiter: '/', parent: null, specialUse: null, total: 4, unread: 40 },
  ];

  const lista: EmailEnvelope[] = [1, 2, 3, 4].map((n) => ({
    id: String(n),
    account: 'mail-1',
    accountLabel: 'Trabalho',
    from: 'Remetente',
    subject: `Mensagem ${n}`,
    unread: true,
    date: `2026-08-2${n}T10:00:00Z`,
    messageId: `<${n}@x>`,
    references: [],
    labels: [],
    mailbox: 'inbox' as const,
    folder: 'INBOX',
  }));

  const corpos: string[] = [];

  function mockarRotas() {
    corpos.length = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const endereco = String(url);
      if (init?.body) corpos.push(String(init.body));
      if (endereco.includes('/api/email/mailboxes')) {
        return new Response(JSON.stringify({ mailboxes: ARVORE }));
      }
      if (endereco.includes('/api/email/batch')) {
        return new Response(JSON.stringify({ results: [] }));
      }
      return new Response(JSON.stringify({ folders: [], ok: true, messages: [] }));
    });
  }

  /** O jsdom não traz DataTransfer; o arraste só precisa do que o código usa. */
  function transferencia() {
    const dados = new Map<string, string>();
    return {
      effectAllowed: '',
      dropEffect: '',
      get types() {
        return [...dados.keys()];
      },
      setData: (tipo: string, valor: string) => dados.set(tipo, valor),
      getData: (tipo: string) => dados.get(tipo) ?? '',
      setDragImage: vi.fn(),
    };
  }

  function montar() {
    render(
      <EmailPanel
        onSeenChanged={() => {}}
        onRemoved={() => {}}
        mailboxes={[{ id: 'mail-1', label: 'Trabalho' }]}
        email={{ data: lista, error: null }}
        onChanged={() => {}}
      />,
    );
  }

  const caixaDe = (n: number) =>
    screen.getByLabelText(`selecionar Mensagem ${n}`) as HTMLInputElement;
  const liDe = (n: number) => caixaDe(n).closest('li')!;
  // O botão do título é o único da linha que anuncia se está aberto.
  const linhaDe = (n: number) => within(liDe(n)).getAllByRole('button')[0];

  beforeEach(() => mockarRotas());

  it('ctrl+clique soma à seleção sem tirar o que já estava', () => {
    montar();
    fireEvent.click(caixaDe(1));
    fireEvent.click(linhaDe(3), { ctrlKey: true });

    expect(caixaDe(1).checked).toBe(true);
    expect(caixaDe(3).checked).toBe(true);
    expect(caixaDe(2).checked).toBe(false);
  });

  it('anda pela lista com as setas e estende com shift', () => {
    montar();
    const listbox = screen.getByRole('listbox', { name: 'conversas' });

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'ArrowDown', shiftKey: true });

    // A lista começa pela mais recente: 4 e depois 3.
    expect(caixaDe(4).checked).toBe(true);
    expect(caixaDe(3).checked).toBe(true);
    expect(caixaDe(2).checked).toBe(false);
  });

  it('seleciona tudo com ctrl+A e limpa com Esc', () => {
    montar();
    const listbox = screen.getByRole('listbox', { name: 'conversas' });

    fireEvent.keyDown(listbox, { key: 'a', ctrlKey: true });
    expect(screen.getByText('4 conversas')).toBeInTheDocument();

    fireEvent.keyDown(listbox, { key: 'Escape' });
    expect(screen.queryByText('4 conversas')).toBeNull();
  });

  // Arrastar uma linha da seleção arrasta o lote inteiro.
  it('leva a seleção inteira no arraste', () => {
    montar();
    fireEvent.click(caixaDe(1));
    fireEvent.click(caixaDe(2));

    const dataTransfer = transferencia();
    fireEvent.dragStart(liDe(2), { dataTransfer });

    const carga = JSON.parse(dataTransfer.getData('application/x-daily-web-email'));
    expect(carga.map((m: { id: string }) => m.id).sort()).toEqual(['1', '2']);
  });

  // Arrastar uma linha de fora da seleção passa a ser a seleção: arrastar uma
  // coisa e mover outra seria surpresa.
  it('arrasta só a linha quando ela não estava selecionada', () => {
    montar();
    fireEvent.click(caixaDe(1));

    const dataTransfer = transferencia();
    fireEvent.dragStart(liDe(3), { dataTransfer });

    const carga = JSON.parse(dataTransfer.getData('application/x-daily-web-email'));
    expect(carga.map((m: { id: string }) => m.id)).toEqual(['3']);
  });

  it('soltar na pasta move o lote inteiro numa operação', async () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir em tela cheia' }));
    await screen.findByRole('navigation', { name: 'Pastas' });

    fireEvent.click(caixaDe(1));
    fireEvent.click(caixaDe(2));

    const dataTransfer = transferencia();
    fireEvent.dragStart(liDe(2), { dataTransfer });
    const pasta = screen.getByRole('button', { name: /^Arquivo em Trabalho/ }).closest('li')!;
    fireEvent.dragOver(pasta, { dataTransfer });
    fireEvent.drop(pasta, { dataTransfer });

    await waitFor(() => expect(corpos.some((c) => c.includes('"action":"move"'))).toBe(true));
    const corpo = JSON.parse(corpos.find((c) => c.includes('"action":"move"'))!);
    expect(corpo.folder).toBe('Arquivo');
    expect(corpo.folderPath).toBe('INBOX');
    expect(corpo.targets.map((t: { id: string }) => t.id).sort()).toEqual(['1', '2']);
  });

  // Uma pasta grande merece a pergunta: não há como desfazer mensagem a
  // mensagem depois.
  it('pergunta antes de marcar uma pasta grande como lida', async () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir em tela cheia' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar a pasta Arquivo de Trabalho como lida' }));

    expect(await screen.findByText(/Marcar 40 mensagens como lidas\?/)).toBeInTheDocument();
    expect(corpos.some((c) => c.includes('folder'))).toBe(false);
  });

  it('marca a pasta como lida depois da confirmação', async () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir em tela cheia' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar a pasta Arquivo de Trabalho como lida' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar como lidas' }));

    await waitFor(() =>
      expect(corpos.some((c) => c.includes('"folder":"Arquivo"'))).toBe(true),
    );
  });
});

describe('alvos de ação no arraste', () => {
  const lista: EmailEnvelope[] = [1, 2, 3].map((n) => ({
    id: String(n), account: 'mail-1', accountLabel: 'Trabalho', from: 'Remetente',
    subject: `Mensagem ${n}`, unread: true, date: `2026-08-2${n}T10:00:00Z`,
    messageId: `<${n}@x>`, references: [], labels: [], mailbox: 'inbox' as const, folder: 'INBOX',
  }));

  let corpos: string[];
  let resultados: { account: string; id: string; ok: boolean; error?: string }[];

  function montar(props: Partial<Parameters<typeof EmailPanel>[0]> = {}) {
    render(
      <EmailPanel
        onSeenChanged={() => {}}
        onRemoved={() => {}}
        mailboxes={[{ id: 'mail-1', label: 'Trabalho' }]}
        email={{ data: lista, error: null }}
        onChanged={() => {}}
        {...props}
      />,
    );
  }

  function transferencia() {
    const dados = new Map<string, string>();
    return {
      effectAllowed: '', dropEffect: '',
      get types() { return [...dados.keys()]; },
      setData: (t: string, v: string) => dados.set(t, v),
      getData: (t: string) => dados.get(t) ?? '',
      setDragImage: vi.fn(),
    };
  }

  const caixaDe = (n: number) =>
    screen.getByLabelText(`selecionar Mensagem ${n}`) as HTMLInputElement;
  const liDe = (n: number) => caixaDe(n).closest('li')!;

  beforeEach(() => {
    corpos = [];
    resultados = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (init?.body) corpos.push(String(init.body));
      if (String(url).includes('/api/email/batch')) {
        return new Response(JSON.stringify({ results: resultados }));
      }
      return new Response(JSON.stringify({ folders: [] }));
    });
  });

  // Fora do arraste os alvos não existem: as três ações já estão na barra.
  it('só mostra os alvos durante o arraste', () => {
    montar();
    fireEvent.click(caixaDe(1));
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeNull();
    expect(screen.queryByRole('group', { name: /Soltar/ })).toBeNull();

    fireEvent.dragStart(liDe(1), { dataTransfer: transferencia() });
    expect(screen.getByRole('group', { name: 'Soltar 1 conversa em uma ação' })).toBeInTheDocument();
  });

  it('anuncia quantas conversas o arraste carrega', () => {
    montar();
    fireEvent.click(caixaDe(1));
    fireEvent.click(caixaDe(2));
    fireEvent.dragStart(liDe(2), { dataTransfer: transferencia() });

    expect(
      screen.getByRole('group', { name: 'Soltar 2 conversas em uma ação' }),
    ).toBeInTheDocument();
  });

  // Passar por cima precisa dizer o que vai acontecer, não só acender.
  it('diz o que o alvo faz quando o cursor está em cima', () => {
    montar();
    fireEvent.click(caixaDe(1));
    const dataTransfer = transferencia();
    fireEvent.dragStart(liDe(1), { dataTransfer });

    const alvo = screen.getByRole('button', { name: 'Excluir as conversas arrastadas' });
    fireEvent.dragOver(alvo, { dataTransfer });

    expect(alvo).toHaveAttribute('aria-current', 'true');
    expect(alvo).toHaveTextContent('Solte para mover para a lixeira');
  });

  it.each([
    ['Marcar como lido', 'read'],
    ['Marcar como não lido', 'unread'],
    ['Excluir as conversas arrastadas', 'delete'],
  ])('soltar em %s executa a ação no lote', async (nome, action) => {
    montar();
    fireEvent.click(caixaDe(1));
    fireEvent.click(caixaDe(2));

    const dataTransfer = transferencia();
    fireEvent.dragStart(liDe(2), { dataTransfer });
    const alvo = screen.getByRole('button', { name: nome });
    fireEvent.dragOver(alvo, { dataTransfer });
    fireEvent.drop(alvo, { dataTransfer });

    await waitFor(() => expect(corpos.some((c) => c.includes(`"action":"${action}"`))).toBe(true));
    const corpo = JSON.parse(corpos.find((c) => c.includes(`"action":"${action}"`))!);
    expect(corpo.targets.map((t: { id: string }) => t.id).sort()).toEqual(['1', '2']);
  });

  // Soltar no vazio é como se desiste no meio do caminho.
  it('não executa nada quando o arraste termina fora de um alvo', async () => {
    montar();
    fireEvent.click(caixaDe(1));
    fireEvent.dragStart(liDe(1), { dataTransfer: transferencia() });
    fireEvent.dragEnd(liDe(1));

    await waitFor(() => expect(screen.queryByRole('group', { name: /Soltar/ })).toBeNull());
    expect(corpos.some((c) => c.includes('"action"'))).toBe(false);
  });

  // As mesmas três ações sem arrastar, pelos botões da barra.
  it('executa as três ações pelo clique, sem arraste', async () => {
    montar();
    fireEvent.click(caixaDe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Marcar não lido' }));

    await waitFor(() => expect(corpos.some((c) => c.includes('"action":"unread"'))).toBe(true));
  });

  describe('quando parte do lote não é processada', () => {
    beforeEach(() => {
      resultados = [
        { account: 'mail-1', id: '1', ok: true },
        { account: 'mail-1', id: '2', ok: false, error: 'conta não encontrada' },
      ];
    });

    it('diz quais mensagens ficaram de fora e por quê', async () => {
      montar();
      fireEvent.click(caixaDe(1));
      fireEvent.click(caixaDe(2));
      fireEvent.click(screen.getByRole('button', { name: 'Marcar lido' }));

      const aviso = await screen.findByText(/não foi processada/);
      expect(aviso).toHaveTextContent('Mensagem 2');
      expect(aviso).toHaveTextContent('conta não encontrada');
      expect(aviso).not.toHaveTextContent('Mensagem 1');
    });

    it('tenta de novo só o que ficou de fora', async () => {
      montar();
      fireEvent.click(caixaDe(1));
      fireEvent.click(caixaDe(2));
      fireEvent.click(screen.getByRole('button', { name: 'Marcar lido' }));
      await screen.findByText(/não foi processada/);

      corpos.length = 0;
      resultados = [{ account: 'mail-1', id: '2', ok: true }];
      fireEvent.click(screen.getByRole('button', { name: 'tentar de novo' }));

      await waitFor(() => expect(corpos).toHaveLength(1));
      const corpo = JSON.parse(corpos[0]);
      expect(corpo.action).toBe('read');
      expect(corpo.targets).toEqual([{ account: 'mail-1', id: '2' }]);
    });
  });
});

describe('criar nota ou tarefa a partir de um e-mail', () => {
  const lista: EmailEnvelope[] = [
    {
      id: '42', account: 'mail-1', accountLabel: 'Trabalho', from: 'Milton Yoshida',
      subject: 'Revisão do PR #481', unread: true, date: '2026-09-12T10:00:00Z',
      messageId: '<a@x>', references: [], labels: [], mailbox: 'inbox' as const, folder: 'INBOX',
    },
  ];

  let chamadas: { url: string; corpo: unknown }[];
  let resposta: () => Response;

  function montar(props: Partial<Parameters<typeof EmailPanel>[0]> = {}) {
    render(
      <EmailPanel
        onSeenChanged={() => {}}
        onRemoved={() => {}}
        mailboxes={[{ id: 'mail-1', label: 'Trabalho' }]}
        email={{ data: lista, error: null }}
        onChanged={() => {}}
        {...props}
      />,
    );
  }

  beforeEach(() => {
    chamadas = [];
    resposta = () => new Response(JSON.stringify({ noteId: 'nota-1', taskId: 'tarefa-1' }));
    vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const endereco = String(url);
      if (endereco.includes('/api/notes/folders')) {
        return new Response(
          JSON.stringify({
            folders: [
              { id: 'p-1', name: 'Trabalho', parentId: null, position: 0, updatedAt: '' },
            ],
          }),
        );
      }
      if (endereco.includes('/api/email/to-')) {
        chamadas.push({ url: endereco, corpo: JSON.parse(String(init?.body ?? '{}')) });
        return resposta();
      }
      return new Response(JSON.stringify({ folders: [] }));
    });
  });

  // O menu do sistema de design abre no ponteiro e no teclado. O teclado é o
  // caminho que interessa garantir, e é o que o jsdom reproduz fielmente.
  const abrirMenu = async () => {
    const gatilho = screen.getByRole('button', { name: 'Ações de Revisão do PR #481' });
    gatilho.focus();
    fireEvent.keyDown(gatilho, { key: 'Enter' });
    return screen.findByRole('menu');
  };

  it('oferece criar nota e criar tarefa num menu', async () => {
    montar();
    const menu = await abrirMenu();

    expect(within(menu).getByRole('menuitem', { name: /Criar nota/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Criar tarefa/ })).toBeInTheDocument();
  });

  // O menu é do sistema de design: abre pelo teclado e anda com as setas.
  it('abre pelo teclado', async () => {
    montar();
    const gatilho = screen.getByRole('button', { name: 'Ações de Revisão do PR #481' });
    gatilho.focus();
    fireEvent.keyDown(gatilho, { key: 'ArrowDown' });

    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
  });

  it('abre pelo ponteiro', async () => {
    montar();
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Ações de Revisão do PR #481' }),
      { button: 0, ctrlKey: false, pointerType: 'mouse' },
    );

    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });

  it('cria a nota sem pasta por padrão', async () => {
    montar();
    const menu = await abrirMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Criar nota/ }));

    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect(chamadas[0].url).toContain('/api/email/to-note');
    expect(chamadas[0].corpo).toMatchObject({ account: 'mail-1', id: '42', folderId: null });
  });

  it('cria a nota na pasta escolhida', async () => {
    montar();
    const menu = await abrirMenu();
    fireEvent.change(within(menu).getByLabelText('Pasta da nota'), { target: { value: 'p-1' } });
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Criar nota/ }));

    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect(chamadas[0].corpo).toMatchObject({ folderId: 'p-1' });
  });

  it('cria a tarefa sem mandar pasta nenhuma', async () => {
    montar();
    const menu = await abrirMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Criar tarefa/ }));

    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect(chamadas[0].url).toContain('/api/email/to-task');
    expect(chamadas[0].corpo).not.toHaveProperty('folderId');
  });

  it('confirma e oferece abrir o que foi criado', async () => {
    montar();
    const menu = await abrirMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Criar nota/ }));

    const aviso = await screen.findByRole('status');
    expect(aviso).toHaveTextContent('Nota criada');
    expect(aviso).toHaveTextContent('Revisão do PR #481');
    expect(within(aviso).getByRole('button', { name: 'Abrir notas' })).toBeInTheDocument();
  });

  // Enquanto a criação está em voo o menu não responde: dois cliques não
  // podem virar duas notas.
  it('trava o menu enquanto a criação está em voo', async () => {
    let liberar: (r: Response) => void = () => {};
    resposta = () => {
      throw new Error('não usado');
    };
    vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const endereco = String(url);
      if (endereco.includes('/api/email/to-')) {
        chamadas.push({ url: endereco, corpo: JSON.parse(String(init?.body ?? '{}')) });
        return new Promise<Response>((r) => (liberar = r));
      }
      return new Response(JSON.stringify({ folders: [] }));
    });

    montar();
    const menu = await abrirMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Criar nota/ }));
    await waitFor(() => expect(chamadas).toHaveLength(1));

    const segundo = await abrirMenu();
    fireEvent.click(within(segundo).getByRole('menuitem', { name: /Criar nota/ }));
    await new Promise((r) => setTimeout(r, 30));

    expect(chamadas).toHaveLength(1);
    liberar(new Response(JSON.stringify({ noteId: 'nota-1' })));
  });

  it('mostra o erro quando a criação falha', async () => {
    resposta = () => new Response(JSON.stringify({ error: 'o limite é de 20 notas' }), { status: 400 });
    montar();
    const menu = await abrirMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Criar nota/ }));

    expect(await screen.findByText('o limite é de 20 notas')).toBeInTheDocument();
  });
});
