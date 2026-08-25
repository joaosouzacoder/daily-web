import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { NotificationsBell } from '@/components/NotificationsBell';
import type { NotificationItem } from '@/lib/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const items: NotificationItem[] = [
  { id: 'A-1', source: 'jira_mention', title: 'A-1 — Bug', url: 'https://x/A-1', read: false },
];

describe('NotificationsBell', () => {
  it('mostra a contagem de não lidas no sino', () => {
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={() => {}} />);
    expect(screen.getByLabelText('notificações').textContent).toContain('1');
  });

  it('não mostra contagem quando tudo está lido', () => {
    render(
      <NotificationsBell
        notifications={{ data: [{ ...items[0], read: true }], error: null }}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByLabelText('notificações').textContent?.trim()).toBe('🔔');
  });

  it('abre o painel e lista as notificações', () => {
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByLabelText('notificações'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/A-1 — Bug/)).toBeInTheDocument();
  });

  it('marcar como lida chama a API e avisa onChanged', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const onChanged = vi.fn();
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText('notificações'));
    fireEvent.click(screen.getByText('marcar como lida'));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/notifications/A-1/read', { method: 'POST' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
