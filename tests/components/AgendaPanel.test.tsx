import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AgendaPanel } from '@/components/AgendaPanel';

afterEach(cleanup);

describe('AgendaPanel', () => {
  it('agrupa os eventos por data e mostra "dia inteiro" quando não há hora', () => {
    render(
      <AgendaPanel
        agenda={{
          data: [
            { account: 'work', date: '2026-08-26', time: '14:00', title: 'Daily' },
            { account: 'personal', date: '2026-08-26', time: '', title: 'Feriado' },
          ],
          error: null,
        }}
      />,
    );
    expect(screen.getByText(/Daily/)).toBeInTheDocument();
    expect(screen.getByText(/dia inteiro — Feriado/)).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<AgendaPanel agenda={{ data: [], error: 'gcalcli falhou: token expirado' }} />);
    expect(screen.getByRole('alert').textContent).toContain('token expirado');
  });
});
