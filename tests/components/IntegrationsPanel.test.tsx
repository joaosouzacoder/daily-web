import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { IntegrationsPanel } from '@/components/IntegrationsPanel';

interface ModuleFixture {
  module: string;
  label: string;
  summary: string;
  multi: boolean;
  enabled: boolean;
  configured: boolean;
  connections: unknown[];
}

function mod(over: Partial<ModuleFixture>): ModuleFixture {
  return {
    module: 'email',
    label: 'E-mail',
    summary: 'Caixa de entrada',
    multi: true,
    enabled: false,
    configured: false,
    connections: [],
    ...over,
  };
}

const EMPTY_MODULES = [
  mod({ module: 'email', label: 'E-mail', multi: true }),
  mod({ module: 'agenda', label: 'Agenda', multi: true }),
  mod({ module: 'jira', label: 'Jira', multi: false }),
  mod({ module: 'pulls', label: 'Pull requests', multi: false }),
  mod({ module: 'tasks', label: 'Tarefas', multi: false, enabled: true }),
];

function payload(over: Record<string, unknown> = {}) {
  return {
    vaultReady: true,
    mstodoAvailable: false,
    modules: EMPTY_MODULES,
    ...over,
  };
}

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.spyOn(global, 'fetch').mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify(handler(String(input), init))),
  );
}

beforeEach(() => {
  mockFetch(() => payload());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('IntegrationsPanel', () => {
  it('lista todos os módulos, mesmo os não configurados', async () => {
    render(<IntegrationsPanel />);
    await waitFor(() => expect(screen.getByText('E-mail')).toBeInTheDocument());
    for (const label of ['Agenda', 'Jira', 'Pull requests', 'Tarefas']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('avisa quando o servidor não tem chave para guardar credencial', async () => {
    mockFetch(() => payload({ vaultReady: false }));
    render(<IntegrationsPanel />);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('DAILY_WEB_SECRET_KEY'),
    );
  });

  it('mostra o passo a passo de como obter a credencial', async () => {
    render(<IntegrationsPanel />);
    await waitFor(() => expect(screen.getByText('Agenda')).toBeInTheDocument());

    const helpButtons = screen.getAllByRole('button', { name: 'Como conseguir isso' });
    fireEvent.click(helpButtons[1]);
    expect(screen.getByText(/Endereço secreto no formato iCal/)).toBeInTheDocument();
  });

  // O preset é o que torna a configuração de e-mail viável para quem não sabe
  // o host do próprio provedor.
  it('esconde host e porta quando o provedor é conhecido e revela no manual', async () => {
    render(<IntegrationsPanel />);
    await waitFor(() => expect(screen.getByText('E-mail')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'Conectar' })[0]);

    expect(screen.queryByLabelText(/Servidor IMAP/)).toBeNull();

    fireEvent.change(screen.getByLabelText(/Provedor/), { target: { value: 'custom' } });
    expect(screen.getByLabelText(/Servidor IMAP/)).toBeInTheDocument();
  });

  it('grava a conexão nova no módulo certo', async () => {
    const calls: { url: string; body: unknown }[] = [];
    mockFetch((url, init) => {
      if (init?.method === 'POST') {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return { modules: EMPTY_MODULES };
      }
      return payload();
    });

    render(<IntegrationsPanel />);
    await waitFor(() => expect(screen.getByText('Agenda')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'Conectar' })[1]);

    fireEvent.change(screen.getByLabelText('Nome desta conexão'), {
      target: { value: 'Pessoal' },
    });
    fireEvent.change(screen.getByLabelText(/URL do iCal/), {
      target: { value: 'https://exemplo/a.ics' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe('/api/integrations/agenda/connections');
    expect(calls[0].body).toEqual({
      label: 'Pessoal',
      values: { icsUrl: 'https://exemplo/a.ics' },
    });
  });

  it('liga e desliga o módulo', async () => {
    const calls: { url: string; body: unknown }[] = [];
    mockFetch((url, init) => {
      if (init?.method === 'PATCH') {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return { modules: EMPTY_MODULES };
      }
      return payload();
    });

    render(<IntegrationsPanel />);
    await waitFor(() => expect(screen.getByText('Jira')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('ligar Jira'));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe('/api/integrations/jira');
    expect(calls[0].body).toEqual({ enabled: true });
  });

  it('mostra o resultado do teste de conexão sem tratar falha como erro da app', async () => {
    const configured = EMPTY_MODULES.map((m) =>
      m.module === 'jira'
        ? {
            ...m,
            enabled: true,
            configured: true,
            connections: [
              {
                id: 'jira-1',
                module: 'jira',
                label: 'Jira',
                visible: { cloud: 'acme' },
                secretsSet: ['token'],
                updatedAt: '2026-08-26',
                unreadable: false,
              },
            ],
          }
        : m,
    );
    mockFetch((url, init) => {
      if (init?.method === 'POST' && url.endsWith('/test')) {
        return { ok: false, message: 'Jira recusou o e-mail ou o API token' };
      }
      return payload({ modules: configured });
    });

    render(<IntegrationsPanel />);
    await waitFor(() => expect(screen.getByText('acme')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Testar' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('recusou o e-mail'),
    );
  });

  // O segredo nunca volta do servidor; o campo precisa dizer que existe algo
  // guardado, senão quem edita o rótulo acha que apagou o token.
  it('avisa que o segredo está guardado ao editar', async () => {
    const configured = EMPTY_MODULES.map((m) =>
      m.module === 'jira'
        ? {
            ...m,
            configured: true,
            connections: [
              {
                id: 'jira-1',
                module: 'jira',
                label: 'Jira',
                visible: { cloud: 'acme', email: 'a@x.com' },
                secretsSet: ['token'],
                updatedAt: '2026-08-26',
                unreadable: false,
              },
            ],
          }
        : m,
    );
    mockFetch(() => payload({ modules: configured }));

    render(<IntegrationsPanel />);
    await waitFor(() => expect(screen.getByText('acme')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(screen.getByLabelText(/API token/)).toHaveAttribute(
      'placeholder',
      expect.stringContaining('guardado'),
    );
  });

  it('não oferece o Microsoft To Do quando a CLI não está instalada', async () => {
    render(<IntegrationsPanel />);
    await waitFor(() => expect(screen.getByText('Tarefas')).toBeInTheDocument());

    // Pelo cartão, não pelo índice: a posição muda quando um módulo entra.
    const card = screen.getByText('Tarefas').closest('article') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Conectar' }));

    const select = within(card).getByLabelText(/Onde guardar/) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['local']);
  });
});
