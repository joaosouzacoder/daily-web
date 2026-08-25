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
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={() => {}} />);
    expect(screen.getByRole('button', { name: /notificações/ }).textContent).toContain('1');
  });

  it('abre o painel e lista as notificações', () => {
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.getByText('Mencionado em A-1')).toBeInTheDocument();
  });

  it('marca como lida e avisa onChanged', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const onChanged = vi.fn();
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    fireEvent.click(screen.getByRole('button', { name: 'marcar Mencionado em A-1 como lida' }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/notifications/A-1/read', { method: 'POST' }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('mostra erro quando marcar falha', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ error: 'banco indisponível' }), { status: 502 }),
    );
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    fireEvent.click(screen.getByRole('button', { name: 'marcar Mencionado em A-1 como lida' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('banco indisponível'));
  });

  it('não oferece marcar como lida numa notificação já lida', () => {
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.queryByRole('button', { name: 'marcar Mencionado em A-2 como lida' })).toBeNull();
  });

  it('mostra o estado vazio quando não há notificações', () => {
    render(<NotificationsBell notifications={{ data: [], error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.getByText(/nada por aqui/i)).toBeInTheDocument();
  });

  it('fecha com a tecla Escape', () => {
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.getByText('Mencionado em A-1')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Mencionado em A-1')).toBeNull();
  });
});
