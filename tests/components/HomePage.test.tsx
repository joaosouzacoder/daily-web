import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { DashboardState, HomeView } from '@/lib/types';

const dashboard = vi.hoisted(() => ({
  state: null as Partial<DashboardState> | null,
  nothingOn: false,
  reload: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('@/components/dashboard/useDashboardPanels', () => ({
  useDashboardPanels: () => ({
    state: dashboard.state,
    reload: dashboard.reload,
    mutate: dashboard.mutate,
    nothingOn: dashboard.nothingOn,
    panels: [{ id: 'jira', node: <p>painel do jira</p> }],
  }),
}));
vi.mock('@/components/shell/ShellUser', () => ({
  useShellUser: () => ({ greetingName: 'Ana', welcome: 'back' }),
}));
vi.mock('@/components/NowBand', () => ({ NowBand: () => null }));
vi.mock('@/components/FocusBlockProvider', () => ({
  FocusBlockProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/DashboardGrid', () => ({
  DashboardGrid: () => <div data-testid="grade" />,
}));
vi.mock('@/components/dashboard/WorkspaceHome', () => ({
  WorkspaceHome: ({ generation }: { generation: number }) => (
    <div data-testid="abas" data-generation={generation} />
  ),
  clearWorkspaceLayout: vi.fn(),
}));

import DashboardPage from '@/app/(app)/page';
import { clearWorkspaceLayout } from '@/components/dashboard/WorkspaceHome';

const fetchMock = vi.fn();

function comVisão(homeView?: HomeView) {
  dashboard.state = { modules: ['jira'], layouts: [], agendaCalendars: [], ...(homeView ? { homeView } : {}) };
}

beforeEach(() => {
  dashboard.nothingOn = false;
  dashboard.reload.mockReset();
  dashboard.mutate.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('disposição do Início', () => {
  it('mostra a grade quando nada foi escolhido, inclusive num estado antigo sem a escolha', () => {
    comVisão();
    render(<DashboardPage />);

    expect(screen.getByTestId('grade')).toBeInTheDocument();
    expect(screen.queryByTestId('abas')).toBeNull();
    expect(screen.getByRole('button', { name: 'Grade' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Restaurar abas/ })).toBeNull();
  });

  it('mostra as abas para quem escolheu', () => {
    comVisão('workspace');
    render(<DashboardPage />);

    expect(screen.getByTestId('abas')).toBeInTheDocument();
    expect(screen.queryByTestId('grade')).toBeNull();
    expect(screen.getByRole('button', { name: 'Abas' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('trocar aplica na hora e grava na conta', async () => {
    comVisão('grid');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ homeView: 'workspace' }) });
    render(<DashboardPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Abas' }));

    const patch = dashboard.mutate.mock.calls[0][0] as (s: DashboardState) => DashboardState;
    expect(patch({ homeView: 'grid' } as DashboardState).homeView).toBe('workspace');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/preferences');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ homeView: 'workspace' });
    expect(dashboard.reload).not.toHaveBeenCalled();
  });

  it('se a gravação falhar, avisa e volta ao que está guardado', async () => {
    comVisão('grid');
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'erro 500' }) });
    render(<DashboardPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Abas' }));

    expect(await screen.findByText('erro 500')).toBeInTheDocument();
    expect(dashboard.reload).toHaveBeenCalled();
  });

  it('escolher a que já está não grava nada', () => {
    comVisão('workspace');
    render(<DashboardPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Abas' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(dashboard.mutate).not.toHaveBeenCalled();
  });

  it('restaurar as abas apaga a disposição deste navegador e remonta', () => {
    comVisão('workspace');
    render(<DashboardPage />);
    expect(screen.getByTestId('abas')).toHaveAttribute('data-generation', '0');

    fireEvent.click(screen.getByRole('button', { name: /Restaurar abas/ }));

    expect(clearWorkspaceLayout).toHaveBeenCalled();
    expect(screen.getByTestId('abas')).toHaveAttribute('data-generation', '1');
  });

  it('sem módulo ligado não oferece a troca', () => {
    comVisão('grid');
    dashboard.nothingOn = true;
    render(<DashboardPage />);

    expect(screen.queryByRole('group', { name: 'Disposição do Início' })).toBeNull();
  });
});
