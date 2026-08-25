import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { Pomodoro } from '@/components/Pomodoro';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const base = {
  enabled: true, phase: 'focus' as const, running: false, remainingSeconds: 90,
  focusMinutes: 25, restMinutes: 5, completedFocusCount: 2,
};

describe('Pomodoro', () => {
  it('mostra a fase, o tempo restante e o contador de focos', () => {
    render(<Pomodoro pomodoro={base} onChanged={() => {}} />);
    const text = screen.getByTestId('pomodoro').textContent ?? '';
    expect(text).toContain('Foco');
    expect(text).toContain('01:30');
    expect(text).toContain('2 focos');
  });

  it('não renderiza nada quando o pomodoro está desligado', () => {
    render(<Pomodoro pomodoro={{ ...base, enabled: false }} onChanged={() => {}} />);
    expect(screen.queryByTestId('pomodoro')).toBeNull();
  });

  it('clicar em "iniciar" chama a API de start e avisa onChanged', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const onChanged = vi.fn();
    render(<Pomodoro pomodoro={base} onChanged={onChanged} />);
    fireEvent.click(screen.getByText('iniciar'));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/pomodoro/start', { method: 'POST' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('mostra "pausar" quando já está rodando', () => {
    render(<Pomodoro pomodoro={{ ...base, running: true }} onChanged={() => {}} />);
    expect(screen.getByText('pausar')).toBeInTheDocument();
  });
});
