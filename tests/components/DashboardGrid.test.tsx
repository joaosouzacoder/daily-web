import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// A grade de verdade precisa medir largura e observar redimensionamento, que
// o jsdom não faz. O que interessa testar aqui é o que decidimos: quando o
// modo de organizar liga, o que é passado para a grade e o que acontece numa
// tela estreita.
const props: Record<string, unknown>[] = [];
vi.mock('react-grid-layout', () => ({
  default: (p: Record<string, unknown>) => {
    props.push(p);
    return <div data-testid="grade">{p.children as React.ReactNode}</div>;
  },
  useContainerWidth: () => ({ width: 1440, mounted: true, containerRef: { current: null } }),
}));

import { DashboardGrid } from '@/components/DashboardGrid';
import { defaultLayout } from '@/lib/dashboardLayout';

const painéis = [
  { id: 'email', node: <p>painel de e-mail</p> },
  { id: 'jira', node: <p>painel do jira</p> },
];

function larguraDaJanela(px: number) {
  window.matchMedia = ((query: string) => ({
    matches: px <= 1023,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  props.length = 0;
  larguraDaJanela(1440);
});

afterEach(cleanup);

const ultimasProps = () => props[props.length - 1];

describe('DashboardGrid', () => {
  it('desenha só os painéis dos módulos ligados', () => {
    render(
      <DashboardGrid layout={defaultLayout()} panels={painéis} onLayoutChange={() => {}} />,
    );
    expect(screen.getByText('painel de e-mail')).toBeInTheDocument();
    expect(screen.getByText('painel do jira')).toBeInTheDocument();
    expect((ultimasProps().layout as { i: string }[]).map((p) => p.i).sort()).toEqual([
      'email',
      'jira',
    ]);
  });

  // Fora do modo de organizar o painel é conteúdo comum: clicar num e-mail,
  // marcar uma tarefa e selecionar texto precisam continuar funcionando.
  it('começa com arrastar e redimensionar desligados', () => {
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onLayoutChange={() => {}} />);
    expect((ultimasProps().dragConfig as { enabled: boolean }).enabled).toBe(false);
    expect((ultimasProps().resizeConfig as { enabled: boolean }).enabled).toBe(false);
  });

  // Segurar Ctrl chegou a ligar o modo. Não liga mais: o botão é a única
  // entrada, e uma tecla comum não pode mudar o que o clique faz.
  it('não liga ao segurar Ctrl', () => {
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onLayoutChange={() => {}} />);

    fireEvent.keyDown(window, { key: 'Control' });
    expect((ultimasProps().dragConfig as { enabled: boolean }).enabled).toBe(false);
    expect((ultimasProps().resizeConfig as { enabled: boolean }).enabled).toBe(false);
  });

  it('o botão prende o modo até ser desligado', () => {
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onLayoutChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
    expect((ultimasProps().dragConfig as { enabled: boolean }).enabled).toBe(true);
    expect((ultimasProps().resizeConfig as { enabled: boolean }).enabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    expect((ultimasProps().dragConfig as { enabled: boolean }).enabled).toBe(false);
    expect((ultimasProps().resizeConfig as { enabled: boolean }).enabled).toBe(false);
  });

  // A dica ficava na tela o tempo todo dizendo para segurar Ctrl.
  it('não anuncia o Ctrl fora do modo', () => {
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onLayoutChange={() => {}} />);
    expect(screen.queryByText(/Ctrl/i)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');

    fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
    expect(screen.getByRole('status')).toHaveTextContent(/Arraste para mover/);
  });

  it('numa tela estreita empilha em coluna, sem grade', () => {
    larguraDaJanela(390);
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onLayoutChange={() => {}} />);

    expect(screen.queryByTestId('grade')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Organizar' })).toBeNull();
    expect(screen.getByText('painel de e-mail')).toBeInTheDocument();
  });

  // A grade emite mudança ao montar e ao medir a largura; gravar isso
  // devolveria o layout ao servidor sem ninguém ter arrastado nada.
  it('não grava quando a disposição não mudou', () => {
    const onLayoutChange = vi.fn();
    render(
      <DashboardGrid layout={defaultLayout()} panels={painéis} onLayoutChange={onLayoutChange} />,
    );
    const emitir = ultimasProps().onLayoutChange as (l: unknown) => void;

    emitir(defaultLayout().filter((p) => ['email', 'jira'].includes(p.i)));
    expect(onLayoutChange).not.toHaveBeenCalled();

    emitir([
      { i: 'email', x: 5, y: 0, w: 7, h: 14 },
      { i: 'jira', x: 0, y: 9, w: 5, h: 12 },
    ]);
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
  });
});
