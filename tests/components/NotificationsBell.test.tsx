import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { NotificationsBell } from '@/components/NotificationsBell';

/** Os retornos de chamada são todos obrigatórios; cada teste só quer falar de
 *  um deles. */
function Bell(props: Partial<ComponentProps<typeof NotificationsBell>>) {
  return (
    <NotificationsBell
      notifications={{ data: [], error: null }}
      onChanged={() => {}}
      onMarkedRead={() => {}}
      onMarkedAllRead={() => {}}
      {...props}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const items = [
  {
    id: 'A-1',
    source: 'jira_mention' as const,
    title: 'Mencionado em A-1',
    url: 'https://x/A-1',
    read: false, date: '2026-08-26T10:00:00Z',
  },
  {
    id: 'A-2',
    source: 'jira_mention' as const,
    title: 'Mencionado em A-2',
    url: 'https://x/A-2',
    read: true, date: '2026-08-26T10:00:00Z',
  },
];

describe('NotificationsBell', () => {
  it('mostra a contagem de não lidas', () => {
    render(<Bell onMarkedRead={() => {}} notifications={{ data: items, error: null }} onChanged={() => {}} />);
    expect(screen.getByRole('button', { name: /notificações/ }).textContent).toContain('1');
  });

  it('abre o painel e lista as notificações', () => {
    render(<Bell onMarkedRead={() => {}} notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.getByText('Mencionado em A-1')).toBeInTheDocument();
  });

  // O badge tem de cair no clique, não quando o servidor responder: marcar
  // como lida é uma escrita local e não há motivo para a tela esperar.
  it('marca como lida na hora do clique, antes da resposta', () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
    const onMarkedRead = vi.fn();
    render(
      <Bell
        onMarkedRead={onMarkedRead}
        notifications={{ data: items, error: null }}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    fireEvent.click(screen.getByRole('button', { name: 'marcar Mencionado em A-1 como lida' }));

    expect(onMarkedRead).toHaveBeenCalledWith('A-1');
  });

  it('chama a API certa', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    render(
      <Bell
        onMarkedRead={() => {}}
        notifications={{ data: items, error: null }}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    fireEvent.click(screen.getByRole('button', { name: 'marcar Mencionado em A-1 como lida' }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'A-1' }),
      }),
    );
  });

  it('recarrega para desfazer quando marcar falha', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ error: 'banco indisponível' }), { status: 502 }),
    );
    const onChanged = vi.fn();
    render(
      <Bell
        onMarkedRead={() => {}}
        notifications={{ data: items, error: null }}
        onChanged={onChanged}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    fireEvent.click(screen.getByRole('button', { name: 'marcar Mencionado em A-1 como lida' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('mostra erro quando marcar falha', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ error: 'banco indisponível' }), { status: 502 }),
    );
    render(<Bell onMarkedRead={() => {}} notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    fireEvent.click(screen.getByRole('button', { name: 'marcar Mencionado em A-1 como lida' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('banco indisponível'));
  });

  it('não oferece marcar como lida numa notificação já lida', () => {
    render(<Bell onMarkedRead={() => {}} notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.queryByRole('button', { name: 'marcar Mencionado em A-2 como lida' })).toBeNull();
  });

  it('mostra o estado vazio quando não há notificações', () => {
    render(<Bell onMarkedRead={() => {}} notifications={{ data: [], error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.getByText(/nada por aqui/i)).toBeInTheDocument();
  });

  it('fecha com a tecla Escape', () => {
    render(<Bell onMarkedRead={() => {}} notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.getByText('Mencionado em A-1')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Mencionado em A-1')).toBeNull();
  });
});

describe('avisos de mais de uma fonte', () => {
  const variadas = [
    { id: 'jira_mention:A-1', source: 'jira_mention' as const, title: 'Mencionado em A-1', url: 'https://x/A-1', read: false, date: '2026-08-26T10:00:00Z' },
    { id: 'pull_request:joao/repo#7', source: 'pull_request' as const, title: 'joao/repo#7 — Corrige login', url: 'https://github.com/joao/repo/pull/7', read: false, date: '2026-08-26T10:00:00Z' },
    { id: 'email:<a@x>', source: 'email' as const, title: 'Milton — Revisão', url: '', read: false, date: '2026-08-26T10:00:00Z' },
  ];

  function montar() {
    render(
      <Bell
        notifications={{ data: variadas, error: null }}
        onChanged={() => {}}
        onMarkedRead={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
  }

  // O rótulo era fixo em "JIRA": com três fontes, o aviso de PR e o de
  // e-mail também se anunciavam como Jira.
  it('diz de qual fonte veio cada aviso', () => {
    montar();
    expect(screen.getByText('JIRA')).toBeTruthy();
    expect(screen.getByText('PR')).toBeTruthy();
    expect(screen.getByText('E-MAIL')).toBeTruthy();
  });

  it('o aviso com endereço abre a página de origem', () => {
    montar();
    const link = screen.getByRole('link', { name: 'joao/repo#7 — Corrige login' });
    expect(link.getAttribute('href')).toBe('https://github.com/joao/repo/pull/7');
  });

  // O e-mail não tem página para abrir; um href vazio recarrega o dashboard
  // e faz o aviso parecer quebrado.
  it('o aviso sem endereço não vira link', () => {
    montar();
    expect(screen.queryByRole('link', { name: 'Milton — Revisão' })).toBeNull();
    expect(screen.getByText('Milton — Revisão')).toBeTruthy();
  });
});

describe('marcar como lida com id que tem caractere de URL', () => {
  // O id do PR carrega '/' e '#'. Indo cru no caminho, o '#' virava fragmento
  // e o '/read' sumia da requisição: o clique nunca chegava ao servidor.
  it('não perde parte da requisição por causa do id', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    render(
      <Bell
        notifications={{ data: [{
          id: 'pull_request:joao/daily-web#12',
          source: 'pull_request' as const,
          title: 'joao/daily-web#12 — Corrige login',
          url: 'https://github.com/joao/daily-web/pull/12',
          read: false, date: '2026-08-26T10:00:00Z',
        }], error: null }}
        onChanged={() => {}}
        onMarkedRead={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    fireEvent.click(screen.getByRole('button', { name: /marcar .* como lida/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain('#');
    expect(JSON.parse(String(init?.body))).toEqual({ id: 'pull_request:joao/daily-web#12' });
  });
});

// Dispensar um a um custa um clique por aviso, e o sino chega a 60: 20 por
// fonte, três fontes.
describe('marcar todas como lidas', () => {
  const naoLidas = [
    { id: 'jira_mention:A-1', source: 'jira_mention' as const, title: 'Menção em A-1', url: 'https://x/A-1', read: false, date: '2026-09-03T10:00:00Z' },
    { id: 'pull_request:joao/repo#7', source: 'pull_request' as const, title: 'PR 7', url: 'https://x/7', read: false, date: '2026-09-03T09:00:00Z' },
    { id: 'email:<a@x>', source: 'email' as const, title: 'Alguém — assunto', url: '', read: true, date: '2026-09-03T08:00:00Z' },
  ];

  const abrir = (props: Parameters<typeof Bell>[0] = {}) => {
    render(<Bell notifications={{ data: naoLidas, error: null }} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
  };

  it('mostra o botão com a contagem de não lidas', () => {
    abrir();
    expect(screen.getByText('2 não lidas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar todas como lidas' })).toBeInTheDocument();
  });

  it('diz "1 não lida" no singular', () => {
    render(<Bell notifications={{ data: [naoLidas[0], naoLidas[2]], error: null }} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.getByText('1 não lida')).toBeInTheDocument();
  });

  // Sem nada para dispensar, o botão seria um controle que não faz nada.
  it('não oferece o botão quando tudo já está lido', () => {
    render(<Bell notifications={{ data: [naoLidas[2]], error: null }} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.queryByRole('button', { name: 'Marcar todas como lidas' })).toBeNull();
  });

  it('manda só as não lidas, num pedido só', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true, marked: 2 }) } as Response);
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.ids).toEqual(['jira_mention:A-1', 'pull_request:joao/repo#7']);
  });

  // O badge cai no clique, como já acontece no aviso individual.
  it('baixa o badge antes da resposta do servidor', () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
    const onMarkedAllRead = vi.fn();
    abrir({ onMarkedAllRead });
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));

    expect(onMarkedAllRead).toHaveBeenCalledWith([
      'jira_mention:A-1',
      'pull_request:joao/repo#7',
    ]);
  });

  it('trava o botão enquanto o pedido corre, para dois cliques não virarem dois lotes', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
    abrir();
    const botao = screen.getByRole('button', { name: 'Marcar todas como lidas' });
    fireEvent.click(botao);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Marcando…' })).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Marcando…' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('avisa e recarrega do servidor quando o lote falha', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'banco fora do ar' }),
    } as Response);
    const onChanged = vi.fn();
    abrir({ onChanged });
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('banco fora do ar'));
    expect(onChanged).toHaveBeenCalled();
  });
});
