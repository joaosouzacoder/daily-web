import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { EmailPanel } from '@/components/EmailPanel';
import type { EmailEnvelope } from '@/lib/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const messages: EmailEnvelope[] = [
  { id: '1', account: 'work', from: 'Alice', subject: 'Oi', unread: true, date: '' },
  { id: '2', account: 'personal', from: 'Bob', subject: 'Fatura', unread: false, date: '' },
];

describe('EmailPanel', () => {
  it('lista os e-mails com remetente e assunto', () => {
    render(<EmailPanel email={{ data: messages, error: null }} onChanged={() => {}} />);
    expect(screen.getByText(/Oi — Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Fatura — Bob/)).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<EmailPanel email={{ data: [], error: 'himalaya falhou: token expirado' }} onChanged={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('token expirado');
  });

  it('selecionar um e-mail habilita as ações em lote', () => {
    render(<EmailPanel email={{ data: messages, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByLabelText('selecionar Oi'));
    expect(screen.getByText('excluir')).toBeInTheDocument();
  });

  it('abrir um e-mail busca o corpo e marca como lido se estava não lido', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'corpo do e-mail' })))
      .mockResolvedValueOnce(new Response('{}'));
    const onChanged = vi.fn();
    render(<EmailPanel email={{ data: messages, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByText(/Oi — Alice/));
    await waitFor(() => expect(screen.getByText('corpo do e-mail')).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledWith('/api/email/work/1/body');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  // POST /api/email/batch sempre responde 200 com { results: [...] } por
  // item (contrato real após o fix do Task 16) — a UI precisa ler esse
  // array em vez de assumir sucesso geral.
  it('ação em lote bem-sucedida limpa a seleção usando o resultado por item', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [{ account: 'work', id: '1', ok: true }] })),
    );
    const onChanged = vi.fn();
    render(<EmailPanel email={{ data: messages, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText('selecionar Oi'));
    fireEvent.click(screen.getByText('excluir'));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('excluir')).not.toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/email/batch',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ targets: [{ account: 'work', id: '1' }], action: 'delete' }),
      }),
    );
  });

  it('ação em lote com falha parcial mostra o erro e mantém selecionado o item que falhou', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ results: [{ account: 'work', id: '1', ok: false, error: 'cli error' }] }),
      ),
    );
    render(<EmailPanel email={{ data: messages, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByLabelText('selecionar Oi'));
    fireEvent.click(screen.getByText('excluir'));

    await waitFor(() => expect(screen.getByText(/cli error/)).toBeInTheDocument());
    expect(screen.getByLabelText('selecionar Oi')).toBeChecked();
  });
});
