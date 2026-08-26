import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { AgendaPanel, relativeDayLabel } from '@/components/AgendaPanel';

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockImplementation(async () => new Response('{}'));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
        days={2}
        onChanged={() => {}}
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
        days={2}
        onChanged={() => {}}
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
    render(<AgendaPanel days={2} onChanged={() => {}} agenda={{ data: [], error: null }} />);
    expect(screen.getByText(/nada agendado/i)).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<AgendaPanel days={2} onChanged={() => {}} agenda={{ data: null, error: 'gcalcli falhou' }} />);
    expect(screen.getByRole('alert').textContent).toContain('gcalcli falhou');
  });
});

describe('período da agenda', () => {
  const vazio = { data: [], error: null };

  it('oferece os períodos e marca o escolhido', () => {
    render(<AgendaPanel agenda={vazio} days={2} onChanged={() => {}} />);

    for (const label of ['Hoje', 'Hoje e amanhã', '3 dias', '7 dias', '14 dias']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Hoje e amanhã' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'false');
  });

  // O período muda o que o servidor busca, não só o que a tela recorta.
  it('grava a escolha e avisa que o estado mudou', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const onChanged = vi.fn();
    render(<AgendaPanel agenda={vazio} days={7} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/preferences',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ agendaDays: 1 }) }),
      ),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('não regrava ao clicar no período já ativo', () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    render(<AgendaPanel agenda={vazio} days={2} onChanged={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hoje e amanhã' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('mostra o erro e não avisa onChanged quando a gravação falha', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ error: 'período inválido' }), { status: 400 }),
    );
    const onChanged = vi.fn();
    render(<AgendaPanel agenda={vazio} days={2} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: '7 dias' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('período inválido'),
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  // O estado vazio precisa combinar com o período escolhido; dizer "nos
  // próximos 7 dias" para quem pediu só hoje seria mentira.
  it('descreve o período escolhido no estado vazio', () => {
    const { rerender } = render(<AgendaPanel agenda={vazio} days={1} onChanged={() => {}} />);
    expect(screen.getByText('Nada agendado para hoje.')).toBeInTheDocument();

    rerender(<AgendaPanel agenda={vazio} days={7} onChanged={() => {}} />);
    expect(screen.getByText('Nada agendado nos próximos 7 dias.')).toBeInTheDocument();
  });
});

describe('rótulo da agenda na linha', () => {
  function evento(account: string, accountLabel: string, title: string) {
    return { account, accountLabel, date: '2026-08-26', time: '10:00', title };
  }

  // Com uma agenda só não há o que desambiguar, e o rótulo em cada linha vira
  // ruído — foi o que deixou o painel pesado.
  it('não mostra o rótulo quando há uma agenda só', () => {
    render(
      <AgendaPanel
        agenda={{ data: [evento('cal-1', 'Google Agenda', 'Daily')], error: null }}
        days={2}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText('Daily')).toBeInTheDocument();
    expect(screen.queryByText('Google Agenda')).toBeNull();
  });

  it('mostra o rótulo quando há mais de uma agenda', () => {
    render(
      <AgendaPanel
        agenda={{
          data: [evento('cal-1', 'Trabalho', 'Daily'), evento('cal-2', 'Pessoal', 'Médico')],
          error: null,
        }}
        days={2}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText('Trabalho')).toBeInTheDocument();
    expect(screen.getByText('Pessoal')).toBeInTheDocument();
  });
});
