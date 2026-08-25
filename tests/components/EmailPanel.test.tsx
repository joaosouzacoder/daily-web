import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { EmailPanel } from '@/components/EmailPanel';
import type { EmailEnvelope } from '@/lib/types';

const items: EmailEnvelope[] = [
  {
    id: '1',
    account: 'work',
    from: 'Milton Yoshida',
    subject: 'Revisão do PR',
    unread: true,
    date: '2026-08-25T10:00:00Z',
  },
  {
    id: '2',
    account: 'personal',
    from: 'GitHub',
    subject: 'Token adicionado',
    unread: false,
    date: '2026-08-24T10:00:00Z',
  },
];

// Um Response só pode ter o corpo lido uma vez: cada chamada precisa de uma
// instância nova, senão a segunda leitura estoura "Body has already been read".
beforeEach(() => {
  vi.spyOn(global, 'fetch').mockImplementation(async () =>
    new Response(JSON.stringify({ folders: [] })),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EmailPanel', () => {
  it('lista os e-mails com assunto e remetente', () => {
    render(<EmailPanel email={{ data: items, error: null }} onChanged={() => {}} />);
    expect(screen.getByText('Revisão do PR')).toBeInTheDocument();
    expect(screen.getByText('Milton Yoshida')).toBeInTheDocument();
  });

  it('filtra por busca textual sem chamar a API', () => {
    render(<EmailPanel email={{ data: items, error: null }} onChanged={() => {}} />);
    const before = vi.mocked(global.fetch).mock.calls.length;
    fireEvent.change(screen.getByLabelText('buscar e-mails'), { target: { value: 'token' } });
    expect(screen.queryByText('Revisão do PR')).toBeNull();
    expect(screen.getByText('Token adicionado')).toBeInTheDocument();
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(before);
  });

  it('filtra por não lidos e mostra o contador de resultados', () => {
    render(<EmailPanel email={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'não lidos' }));
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
    expect(screen.queryByText('Token adicionado')).toBeNull();
  });

  it('remove um filtro ativo pelo chip', () => {
    render(<EmailPanel email={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'não lidos' }));
    fireEvent.click(screen.getByRole('button', { name: 'remover filtro não lidos' }));
    expect(screen.getByText('Token adicionado')).toBeInTheDocument();
  });

  it('mostra o estado vazio quando o filtro não acha nada', () => {
    render(<EmailPanel email={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('buscar e-mails'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/nenhum e-mail/i)).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<EmailPanel email={{ data: null, error: 'himalaya falhou' }} onChanged={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('himalaya falhou');
  });

  it('marca em lote e reseleciona só os que falharam', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/email/batch')) {
        return new Response(
          JSON.stringify({ results: [{ account: 'work', id: '1', ok: false, error: 'x' }] }),
        );
      }
      return new Response(JSON.stringify({ folders: [] }));
    });
    const onChanged = vi.fn();
    render(<EmailPanel email={{ data: items, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText('selecionar Revisão do PR'));
    fireEvent.click(screen.getByRole('button', { name: 'marcar lido' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('falharam'));
    expect(onChanged).toHaveBeenCalled();
  });
});
