import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { IntegrationsPanel } from '@/components/IntegrationsPanel';

const payload = {
  vaultReady: true,
  inheritsMachineEnv: false,
  fields: {
    jira: [
      { name: 'cloud', label: 'Domínio Jira Cloud', secret: false },
      { name: 'token', label: 'API token', secret: true },
    ],
    github: [{ name: 'token', label: 'Personal access token', secret: true }],
    mstodo: [{ name: 'clientId', label: 'Application (client) ID', secret: false }],
  },
  credentials: [
    { provider: 'jira', configured: true, updatedAt: '2026-08-26T00:00:00Z', visible: { cloud: 'acme' } },
    { provider: 'github', configured: false, updatedAt: null, visible: {} },
    { provider: 'mstodo', configured: false, updatedAt: null, visible: {} },
  ],
};

function mockFetch(over: (url: string, init?: RequestInit) => Response | null = () => null, base = payload) {
  vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const custom = over(String(input), init as RequestInit);
    if (custom) return custom;
    return new Response(JSON.stringify(base));
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('IntegrationsPanel', () => {
  it('mostra o que está configurado e o que não está', async () => {
    mockFetch();
    render(<IntegrationsPanel />);
    expect(await screen.findByText('Jira')).toBeInTheDocument();
    expect(screen.getByText(/acme/)).toBeInTheDocument();
    expect(screen.getAllByText('não configurado')).toHaveLength(2);
  });

  it('salva a credencial pelo formulário', async () => {
    const puts: { url: string; body: string }[] = [];
    mockFetch((url, init) => {
      if (init?.method === 'PUT') {
        puts.push({ url, body: String(init.body) });
        return new Response(JSON.stringify({ credential: {} }));
      }
      return null;
    });
    render(<IntegrationsPanel />);
    await screen.findByText('GitHub');

    // GitHub e To Do estão ambos por configurar; o primeiro botão é o do GitHub.
    fireEvent.click(screen.getAllByRole('button', { name: 'Configurar' })[0]);
    fireEvent.change(screen.getByLabelText('GitHub — Personal access token'), {
      target: { value: 'ghp_token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].url).toBe('/api/credentials/github');
    expect(JSON.parse(puts[0].body)).toEqual({ values: { token: 'ghp_token' } });
  });

  // O campo secreto nunca vem do servidor; abrir "Editar" não pode revelá-lo.
  it('não preenche o campo secreto ao editar uma credencial existente', async () => {
    mockFetch();
    render(<IntegrationsPanel />);
    await screen.findByText('Jira');

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByLabelText('Jira — Domínio Jira Cloud')).toHaveValue('acme');
    expect(screen.getByLabelText('Jira — API token')).toHaveValue('');
  });

  it('remove a credencial depois de confirmar', async () => {
    const deleted: string[] = [];
    mockFetch((url, init) => {
      if (init?.method === 'DELETE') {
        deleted.push(url);
        return new Response(JSON.stringify({ ok: true }));
      }
      return null;
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<IntegrationsPanel />);
    await screen.findByText('Jira');

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(deleted).toEqual(['/api/credentials/jira']));
  });

  it('avisa e bloqueia o salvamento quando falta a chave do cofre', async () => {
    mockFetch(() => null, { ...payload, vaultReady: false });
    render(<IntegrationsPanel />);
    expect(await screen.findByText(/DAILY_WEB_SECRET_KEY/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Configurar' })[0]);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  // O dono da máquina herda o env do serviço; dizer "não configurado" para ele
  // sugeriria que o painel está quebrado quando não está.
  it('diz ao dono da máquina que ele está usando a configuração do serviço', async () => {
    mockFetch(() => null, { ...payload, inheritsMachineEnv: true });
    render(<IntegrationsPanel />);
    expect(await screen.findAllByText('usando a configuração da máquina')).toHaveLength(2);
  });
});
