import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';

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
      <DashboardGrid layout={defaultLayout()} panels={painéis} onSave={() => {}} />,
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
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onSave={() => {}} />);
    expect((ultimasProps().dragConfig as { enabled: boolean }).enabled).toBe(false);
    expect((ultimasProps().resizeConfig as { enabled: boolean }).enabled).toBe(false);
  });

  // Segurar Ctrl chegou a ligar o modo. Não liga mais: o botão é a única
  // entrada, e uma tecla comum não pode mudar o que o clique faz.
  it('não liga ao segurar Ctrl', () => {
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onSave={() => {}} />);

    fireEvent.keyDown(window, { key: 'Control' });
    expect((ultimasProps().dragConfig as { enabled: boolean }).enabled).toBe(false);
    expect((ultimasProps().resizeConfig as { enabled: boolean }).enabled).toBe(false);
  });

  it('o botão prende o modo até ser desligado', () => {
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onSave={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
    expect((ultimasProps().dragConfig as { enabled: boolean }).enabled).toBe(true);
    expect((ultimasProps().resizeConfig as { enabled: boolean }).enabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect((ultimasProps().dragConfig as { enabled: boolean }).enabled).toBe(false);
    expect((ultimasProps().resizeConfig as { enabled: boolean }).enabled).toBe(false);
  });

  // A dica ficava na tela o tempo todo dizendo para segurar Ctrl.
  it('não anuncia o Ctrl fora do modo', () => {
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onSave={() => {}} />);
    expect(screen.queryByText(/Ctrl/i)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');

    fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
    expect(screen.getByRole('status')).toHaveTextContent(/Arraste para mover/);
  });

  it('numa tela estreita empilha em coluna, sem grade', () => {
    larguraDaJanela(390);
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onSave={() => {}} />);

    expect(screen.queryByTestId('grade')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Organizar' })).toBeNull();
    expect(screen.getByText('painel de e-mail')).toBeInTheDocument();
  });

  // Arrastar não grava mais nada sozinho: a gravação é do botão.
  it('arrastar não chama o salvamento', () => {
    const onSave = vi.fn();
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onSave={onSave} />);

    const emitir = ultimasProps().onLayoutChange as (l: unknown) => void;
    emitir([
      { i: 'email', x: 5, y: 0, w: 7, h: 14 },
      { i: 'jira', x: 0, y: 9, w: 5, h: 12 },
    ]);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('salvar para esta tela', () => {
  // A grade chama isto de fora do React; sem o act, a mudança de estado não
  // é processada antes do clique seguinte.
  function arrastar(para: unknown) {
    act(() => {
      (ultimasProps().onLayoutChange as (l: unknown) => void)(para);
    });
  }
  const MOVIDO = [
    { i: 'email', x: 5, y: 0, w: 7, h: 14 },
    { i: 'jira', x: 0, y: 9, w: 5, h: 12 },
  ];

  it('fora do modo, só existe Organizar', () => {
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onSave={() => {}} />);
    expect(screen.getByRole('button', { name: 'Organizar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Salvar/ })).toBeNull();
  });

  it('no modo, aparecem salvar e descartar', () => {
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onSave={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));

    expect(screen.getByRole('button', { name: 'Salvar para esta tela' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Organizar' })).toBeNull();
  });

  it('salva o que foi arrastado', async () => {
    const onSave = vi.fn();
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));

    arrastar(MOVIDO);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar para esta tela' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const salvo = onSave.mock.calls[0][0] as { i: string; x: number }[];
    expect(salvo.find((p) => p.i === 'email')?.x).toBe(5);
  });

  // Entrar no modo e não mexer em nada ainda é uma escolha: fixa a disposição
  // atual para esta tela.
  it('salva a disposição atual mesmo sem arrastar', async () => {
    const onSave = vi.fn();
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar para esta tela' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('descartar sai do modo sem gravar', () => {
    const onSave = vi.fn();
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));

    arrastar(MOVIDO);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Organizar' })).toBeInTheDocument();
  });

  // O que foi arrastado e descartado não pode continuar na tela.
  it('descartar devolve a disposição gravada', () => {
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onSave={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));

    arrastar(MOVIDO);
    expect((ultimasProps().layout as { i: string; x: number }[]).find((p) => p.i === 'email')?.x).toBe(5);

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    const padrao = defaultLayout().find((p) => p.i === 'email')!;
    expect((ultimasProps().layout as { i: string; x: number }[]).find((p) => p.i === 'email')?.x).toBe(
      padrao.x,
    );
  });

  it('salvar fecha o modo', async () => {
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onSave={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar para esta tela' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Organizar' })).toBeInTheDocument(),
    );
  });

  // Sem ver o tamanho, salvar é às cegas.
  it('a dica diz para qual tela vai gravar', () => {
    render(<DashboardGrid layout={defaultLayout()} panels={painéis} onSave={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      `${window.innerWidth} × ${window.innerHeight}`,
    );
  });
});
