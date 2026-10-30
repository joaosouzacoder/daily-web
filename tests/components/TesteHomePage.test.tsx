import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode, Ref } from 'react';

const dashboard = vi.hoisted(() => ({
  value: {
    state: { agendaCalendars: [] } as unknown,
    reload: () => {},
    nothingOn: false,
    panels: [] as { id: string; node: ReactNode }[],
  },
}));

vi.mock('@/components/dashboard/useDashboardPanels', () => ({
  useDashboardPanels: () => dashboard.value,
}));
vi.mock('@/components/FocusBlockProvider', () => ({
  FocusBlockProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@danfessler/trellis/style.css', () => ({}));

// O Trellis de verdade mede o elemento e anima, o que o jsdom não faz. Aqui
// interessa o que a página entrega a ele: tipos de view, disposição inicial,
// chave de gravação e o que ela faz com o handle ao montar.
const trellis = vi.hoisted(() => ({
  mounts: 0,
  props: [] as Record<string, unknown>[],
  snapshot: { views: [] as { type: string }[], hidden: [] as { views: { type: string }[] }[] },
  opened: [] as string[],
}));
vi.mock('@danfessler/trellis-react', async () => {
  const { useEffect } = await import('react');
  const actual = await vi.importActual<typeof import('@danfessler/trellis')>('@danfessler/trellis');
  return {
    layout: actual.layout,
    Workspace: (p: Record<string, unknown> & { children: ReactNode; ref?: Ref<unknown> }) => {
      trellis.props.push(p);
      useEffect(() => {
        trellis.mounts += 1;
        const handle = {
          getSnapshot: () => trellis.snapshot,
          open: (type: string) => {
            trellis.opened.push(type);
          },
        };
        if (typeof p.ref === 'function') p.ref(handle);
      }, []);
      return <div data-testid="workspace">{p.children}</div>;
    },
    ViewType: ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
      <section aria-label={title} data-type={id}>
        {children}
      </section>
    ),
  };
});

import TesteHomePage from '@/app/(app)/teste-home/page';

const painel = (id: string) => ({ id, node: <p>painel {id}</p> });
const ultimas = () => trellis.props[trellis.props.length - 1];

beforeEach(() => {
  trellis.mounts = 0;
  trellis.props = [];
  trellis.opened = [];
  trellis.snapshot = { views: [], hidden: [] };
  dashboard.value = { ...dashboard.value, nothingOn: false, panels: [painel('tasks'), painel('jira'), painel('pulls')] };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Teste Home', () => {
  it('registra uma view por módulo ligado, com o título do módulo', () => {
    render(<TesteHomePage />);

    expect(screen.getByRole('region', { name: 'Tarefas' })).toHaveTextContent('painel tasks');
    expect(screen.getByRole('region', { name: 'Jira' })).toHaveTextContent('painel jira');
    expect(screen.getByRole('region', { name: 'GitHub' })).toHaveTextContent('painel pulls');
  });

  it('começa em duas colunas e grava a disposição neste navegador', () => {
    render(<TesteHomePage />);

    expect(ultimas().storageKey).toBe('daily-web:teste-home');
    const layout = ultimas().defaultLayout as { kind: string; children: { children: { type: string }[] }[] };
    expect(layout.kind).toBe('split');
    expect(layout.children.map((col) => col.children.map((v) => v.type))).toEqual([
      ['tasks', 'jira'],
      ['pulls'],
    ]);
  });

  it('abre o módulo que não está na disposição salva e deixa quieto o que foi escondido', () => {
    trellis.snapshot = { views: [{ type: 'tasks' }], hidden: [{ views: [{ type: 'jira' }] }] };
    render(<TesteHomePage />);

    expect(trellis.opened).toEqual(['pulls']);
  });

  it('restaurar apaga a disposição salva e remonta com a inicial', () => {
    localStorage.setItem('daily-web:teste-home', '{"schema":1}');
    render(<TesteHomePage />);
    expect(trellis.mounts).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /Restaurar disposição/ }));

    expect(localStorage.getItem('daily-web:teste-home')).toBeNull();
    expect(trellis.mounts).toBe(2);
  });

  it('sem módulo ligado, explica em vez de mostrar um espaço vazio', () => {
    dashboard.value = { ...dashboard.value, nothingOn: true, panels: [] };
    render(<TesteHomePage />);

    expect(screen.getByText('Nenhum módulo ligado ainda')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace')).toBeNull();
  });
});
