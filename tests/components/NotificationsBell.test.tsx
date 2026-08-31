import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { NotificationsBell } from '@/components/NotificationsBell';

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
    read: false,
  },
  {
    id: 'A-2',
    source: 'jira_mention' as const,
    title: 'Mencionado em A-2',
    url: 'https://x/A-2',
    read: true,
  },
];

describe('NotificationsBell', () => {
  it('mostra a contagem de não lidas', () => {
    render(<NotificationsBell onMarkedRead={() => {}} notifications={{ data: items, error: null }} onChanged={() => {}} />);
    expect(screen.getByRole('button', { name: /notificações/ }).textContent).toContain('1');
  });

  it('abre o painel e lista as notificações', () => {
    render(<NotificationsBell onMarkedRead={() => {}} notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.getByText('Mencionado em A-1')).toBeInTheDocument();
  });

  // O badge tem de cair no clique, não quando o servidor responder: marcar
  // como lida é uma escrita local e não há motivo para a tela esperar.
  it('marca como lida na hora do clique, antes da resposta', () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
    const onMarkedRead = vi.fn();
    render(
      <NotificationsBell
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
      <NotificationsBell
        onMarkedRead={() => {}}
        notifications={{ data: items, error: null }}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    fireEvent.click(screen.getByRole('button', { name: 'marcar Mencionado em A-1 como lida' }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/notifications/A-1/read', { method: 'POST' }),
    );
  });

  it('recarrega para desfazer quando marcar falha', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ error: 'banco indisponível' }), { status: 502 }),
    );
    const onChanged = vi.fn();
    render(
      <NotificationsBell
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
    render(<NotificationsBell onMarkedRead={() => {}} notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    fireEvent.click(screen.getByRole('button', { name: 'marcar Mencionado em A-1 como lida' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('banco indisponível'));
  });

  it('não oferece marcar como lida numa notificação já lida', () => {
    render(<NotificationsBell onMarkedRead={() => {}} notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.queryByRole('button', { name: 'marcar Mencionado em A-2 como lida' })).toBeNull();
  });

  it('mostra o estado vazio quando não há notificações', () => {
    render(<NotificationsBell onMarkedRead={() => {}} notifications={{ data: [], error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.getByText(/nada por aqui/i)).toBeInTheDocument();
  });

  it('fecha com a tecla Escape', () => {
    render(<NotificationsBell onMarkedRead={() => {}} notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.getByText('Mencionado em A-1')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Mencionado em A-1')).toBeNull();
  });
});

describe('avisos de mais de uma fonte', () => {
  const variadas = [
    { id: 'jira_mention:A-1', source: 'jira_mention' as const, title: 'Mencionado em A-1', url: 'https://x/A-1', read: false },
    { id: 'pull_request:joao/repo#7', source: 'pull_request' as const, title: 'joao/repo#7 — Corrige login', url: 'https://github.com/joao/repo/pull/7', read: false },
    { id: 'email:<a@x>', source: 'email' as const, title: 'Milton — Revisão', url: '', read: false },
  ];

  function montar() {
    render(
      <NotificationsBell
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
