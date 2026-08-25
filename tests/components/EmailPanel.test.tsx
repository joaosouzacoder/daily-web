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
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ folders: [] })));
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
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((input) => {
      if (String(input).startsWith('/api/email/folders')) {
        return Promise.resolve(new Response(JSON.stringify({ folders: [] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ results: [{ account: 'work', id: '1', ok: true }] })),
      );
    });
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

  it('excluir um e-mail aberto pede confirmação e NÃO chama a API se o usuário recusar', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'corpo do e-mail' })))
      .mockResolvedValueOnce(new Response('{}'));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EmailPanel email={{ data: messages, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByText(/Oi — Alice/));
    await waitFor(() => expect(screen.getByText('corpo do e-mail')).toBeInTheDocument());
    fetchSpy.mockClear();

    fireEvent.click(screen.getByText('excluir'));

    expect(window.confirm).toHaveBeenCalledWith('Excluir este e-mail?');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('excluir um e-mail aberto chama a API de exclusão quando o usuário confirma', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'corpo do e-mail' })))
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [{ account: 'work', id: '1', ok: true }] })),
      );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onChanged = vi.fn();
    render(<EmailPanel email={{ data: messages, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByText(/Oi — Alice/));
    await waitFor(() => expect(screen.getByText('corpo do e-mail')).toBeInTheDocument());

    fireEvent.click(screen.getByText('excluir'));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/email/batch',
        expect.objectContaining({
          body: JSON.stringify({ targets: [{ account: 'work', id: '1' }], action: 'delete' }),
        }),
      ),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('selecionar um e-mail busca as pastas da conta e as renderiza como opções', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((input) => {
      if (String(input).startsWith('/api/email/folders')) {
        return Promise.resolve(new Response(JSON.stringify({ folders: ['INBOX', 'Arquivo'] })));
      }
      return Promise.resolve(new Response('{}'));
    });
    render(<EmailPanel email={{ data: messages, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByLabelText('selecionar Oi'));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/email/folders?account=work'));
    expect(screen.getByRole('option', { name: 'INBOX' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Arquivo' })).toBeInTheDocument();
  });

  it('escolher uma pasta e clicar em "mover" chama o batch com action "move" e a pasta escolhida', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((input) => {
      if (String(input).startsWith('/api/email/folders')) {
        return Promise.resolve(new Response(JSON.stringify({ folders: ['INBOX', 'Arquivo'] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ results: [{ account: 'work', id: '1', ok: true }] })),
      );
    });
    const onChanged = vi.fn();
    render(<EmailPanel email={{ data: messages, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText('selecionar Oi'));
    await waitFor(() => expect(screen.getByLabelText('pasta de destino')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('pasta de destino'), { target: { value: 'Arquivo' } });
    fireEvent.click(screen.getByText('mover'));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/email/batch',
        expect.objectContaining({
          body: JSON.stringify({
            targets: [{ account: 'work', id: '1' }],
            action: 'move',
            folder: 'Arquivo',
          }),
        }),
      ),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('ação em lote com falha parcial mostra o erro e mantém selecionado o item que falhou', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input) => {
      if (String(input).startsWith('/api/email/folders')) {
        return Promise.resolve(new Response(JSON.stringify({ folders: [] })));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ results: [{ account: 'work', id: '1', ok: false, error: 'cli error' }] }),
        ),
      );
    });
    render(<EmailPanel email={{ data: messages, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByLabelText('selecionar Oi'));
    fireEvent.click(screen.getByText('excluir'));

    await waitFor(() => expect(screen.getByText(/cli error/)).toBeInTheDocument());
    expect(screen.getByLabelText('selecionar Oi')).toBeChecked();
  });
});
