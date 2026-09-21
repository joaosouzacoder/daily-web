import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgendaPanel } from '@/components/AgendaPanel';
import { FocusBlockProvider, useFocusBlock } from '@/components/FocusBlockProvider';
import { FOCUS_DRAG_TYPE } from '@/lib/focusBlock';

vi.mock('sonner', () => ({ toast: vi.fn() }));

const writable = {
  id: 'cal-1',
  label: 'Trabalho',
  account: 'joao@exemplo.com',
  canWrite: true,
};

function Trigger() {
  const focus = useFocusBlock();
  return (
    <button type="button" onClick={() => focus.schedule({ kind: 'jira', ref: 'DEV-1', title: 'Corrigir busca', url: 'https://jira/DEV-1' })}>
      abrir
    </button>
  );
}

describe('FocusBlockProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T10:07:00'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('mostra os padrões e envia o payload confirmado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ item: {} }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const onCreated = vi.fn();
    render(
      <FocusBlockProvider calendars={[writable]} onCreated={onCreated}>
        <Trigger />
      </FocusBlockProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'abrir' }));
    expect(screen.getByText('Corrigir busca')).toBeInTheDocument();
    expect(screen.getByLabelText('Dia')).toHaveValue('2026-09-21');
    expect(screen.getByLabelText('Início')).toHaveValue('10:30');
    fireEvent.click(screen.getByRole('button', { name: 'Criar bloco' }));

    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledOnce();
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(options.body))).toEqual({
      connectionId: 'cal-1',
      item: { kind: 'jira', ref: 'DEV-1', title: 'Corrigir busca', url: 'https://jira/DEV-1' },
      start: new Date('2026-09-21T10:30:00').toISOString(),
      minutes: 50,
    });
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it('oferece reconexão quando nenhuma agenda pode escrever', () => {
    render(
      <FocusBlockProvider calendars={[{ ...writable, canWrite: false }]} onCreated={() => {}}>
        <Trigger />
      </FocusBlockProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'abrir' }));
    expect(screen.getByText('Para criar blocos de foco, reconecte sua conta do Google.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Reconectar/ })).toHaveAttribute(
      'href',
      '/api/integrations/agenda/google/start?login_hint=joao%40exemplo.com',
    );
  });
});

describe('AgendaPanel com blocos de foco', () => {
  afterEach(() => cleanup());

  it('mostra a zona quando habilitado e abre a origem solta', () => {
    render(
      <FocusBlockProvider calendars={[writable]} onCreated={() => {}}>
        <AgendaPanel agenda={{ data: [], error: null }} days={2} onChanged={() => {}} />
      </FocusBlockProvider>,
    );
    const target = screen.getByRole('button', { name: 'Solte aqui para agendar um bloco de foco' });
    const raw = JSON.stringify({ kind: 'task', ref: 't-1', title: 'Escrever relatório' });
    fireEvent.drop(target, { dataTransfer: { types: [FOCUS_DRAG_TYPE], getData: () => raw } });
    expect(screen.getByText('Escrever relatório')).toBeInTheDocument();
  });

  it('ignora JSON inválido e esconde a zona quando desabilitado', () => {
    const { rerender } = render(
      <FocusBlockProvider calendars={[writable]} onCreated={() => {}}>
        <AgendaPanel agenda={{ data: [], error: null }} days={2} onChanged={() => {}} />
      </FocusBlockProvider>,
    );
    const target = screen.getByRole('button', { name: 'Solte aqui para agendar um bloco de foco' });
    fireEvent.drop(target, { dataTransfer: { types: [FOCUS_DRAG_TYPE], getData: () => '{' } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <FocusBlockProvider calendars={[]} onCreated={() => {}}>
        <AgendaPanel agenda={{ data: [], error: null }} days={2} onChanged={() => {}} />
      </FocusBlockProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Solte aqui para agendar um bloco de foco' })).not.toBeInTheDocument();
  });
});
