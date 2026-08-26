import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AgendaPanel, relativeDayLabel } from '@/components/AgendaPanel';

afterEach(cleanup);

describe('relativeDayLabel', () => {
  const today = new Date(2026, 7, 25); // 25/08/2026, hora local

  it('chama o dia corrente de hoje', () => {
    expect(relativeDayLabel('2026-08-25', today)).toBe('hoje');
  });

  it('chama o dia seguinte de amanhã', () => {
    expect(relativeDayLabel('2026-08-26', today)).toBe('amanhã');
  });

  it('usa dia da semana e data por extenso nos demais dias', () => {
    expect(relativeDayLabel('2026-08-29', today)).toBe('sábado, 29 de agosto');
  });
});

describe('AgendaPanel', () => {
  it('renderiza os eventos agrupados por dia', () => {
    render(
      <AgendaPanel
        agenda={{
          data: [{ account: 'cal-1', accountLabel: 'Trabalho', date: '2026-08-26', time: '14:00', title: 'Daily' }],
          error: null,
        }}
      />,
    );
    expect(screen.getByText('Daily')).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
  });

  it('mostra evento de dia inteiro sem horário', () => {
    render(
      <AgendaPanel
        agenda={{
          data: [{ account: 'cal-2', accountLabel: 'Pessoal', date: '2026-08-27', time: '', title: 'Feriado' }],
          error: null,
        }}
      />,
    );
    expect(screen.getByText('dia')).toBeInTheDocument();
    expect(screen.getByText('Feriado')).toBeInTheDocument();
  });

  it('mostra o estado vazio quando não há eventos', () => {
    render(<AgendaPanel agenda={{ data: [], error: null }} />);
    expect(screen.getByText(/nada agendado/i)).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<AgendaPanel agenda={{ data: null, error: 'gcalcli falhou' }} />);
    expect(screen.getByRole('alert').textContent).toContain('gcalcli falhou');
  });
});
