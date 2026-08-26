import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { UsersPanel } from '@/components/UsersPanel';

const users = [
  { id: 'u-1', username: 'joao', isAdmin: true, createdAt: '2026-08-26T00:00:00Z' },
  { id: 'u-2', username: 'maria', isAdmin: false, createdAt: '2026-08-26T01:00:00Z' },
];

function mockFetch(overrides: (url: string, init?: RequestInit) => Response | null = () => null) {
  vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const custom = overrides(url, init as RequestInit);
    if (custom) return custom;
    return new Response(JSON.stringify({ users }));
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UsersPanel', () => {
  it('lista os usuários e marca quem é admin', async () => {
    mockFetch();
    render(<UsersPanel />);
    expect(await screen.findByText('joao')).toBeInTheDocument();
    expect(screen.getByText('maria')).toBeInTheDocument();
    // "admin" também é o rótulo do checkbox do formulário; olhar só o meta
    // da linha evita casar com ele.
    const metas = screen.getAllByText('admin').filter((el) => el.className.includes('row-meta'));
    expect(metas).toHaveLength(1);
    expect(screen.getByText('usuário')).toBeInTheDocument();
  });

  it('cria um usuário e recarrega a lista', async () => {
    const bodies: string[] = [];
    mockFetch((url, init) => {
      if (url === '/api/users' && init?.method === 'POST') {
        bodies.push(String(init.body));
        return new Response(JSON.stringify({ user: {} }), { status: 201 });
      }
      return null;
    });
    render(<UsersPanel />);
    await screen.findByText('joao');

    fireEvent.change(screen.getByLabelText('novo usuário'), { target: { value: 'ana' } });
    fireEvent.change(screen.getByLabelText('senha do novo usuário'), { target: { value: 'senha-da-ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar usuário' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(JSON.parse(bodies[0])).toEqual({ username: 'ana', password: 'senha-da-ana', isAdmin: false });
  });

  it('mostra o erro do servidor quando a criação falha', async () => {
    mockFetch((url, init) => {
      if (url === '/api/users' && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'a senha precisa de pelo menos 8 caracteres' }), { status: 400 });
      }
      return null;
    });
    render(<UsersPanel />);
    await screen.findByText('joao');

    fireEvent.change(screen.getByLabelText('novo usuário'), { target: { value: 'ana' } });
    fireEvent.change(screen.getByLabelText('senha do novo usuário'), { target: { value: 'curta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar usuário' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/8 caracteres/));
  });

  it('remove um usuário depois de confirmar', async () => {
    const deleted: string[] = [];
    mockFetch((url, init) => {
      if (init?.method === 'DELETE') {
        deleted.push(url);
        return new Response(JSON.stringify({ ok: true }));
      }
      return null;
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<UsersPanel />);
    await screen.findByText('maria');

    fireEvent.click(screen.getByRole('button', { name: 'remover maria' }));
    await waitFor(() => expect(deleted).toEqual(['/api/users/maria']));
  });

  it('cancelar a confirmação não remove', async () => {
    mockFetch();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<UsersPanel />);
    await screen.findByText('maria');
    const before = vi.mocked(global.fetch).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'remover maria' }));
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(before);
  });

  it('troca a senha pelo formulário embutido', async () => {
    const patched: string[] = [];
    mockFetch((url, init) => {
      if (init?.method === 'PATCH') {
        patched.push(String(init.body));
        return new Response(JSON.stringify({ ok: true }));
      }
      return null;
    });
    render(<UsersPanel />);
    await screen.findByText('maria');

    fireEvent.click(screen.getAllByRole('button', { name: 'Trocar senha' })[1]);
    fireEvent.change(screen.getByLabelText('nova senha de maria'), { target: { value: 'nova-senha-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(patched).toHaveLength(1));
    expect(JSON.parse(patched[0])).toEqual({ password: 'nova-senha-123' });
  });

  it('quem não é admin vê a mensagem em vez da lista', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ error: 'apenas admin' }), { status: 403 }),
    );
    render(<UsersPanel />);
    expect(await screen.findByText(/só admins/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('novo usuário')).toBeNull();
  });
});
