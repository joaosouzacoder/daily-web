'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import GridLayout, { useContainerWidth, type Layout } from 'react-grid-layout';
import {
  GRID_COLUMNS,
  GRID_ROW_HEIGHT,
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
  layoutFor,
  parseLayout,
  serializeLayout,
  type PanelPlacement,
} from '@/lib/dashboardLayout';

/** Abaixo disto a grade não cabe: os painéis viram uma coluna só, empilhada
 *  na ordem de cima para baixo, e arrastar sai do caminho. */
const NARROW_BREAKPOINT = 1023;

const naoFazNada = () => {};

interface Props {
  layout: PanelPlacement[];
  /** Ids dos painéis a desenhar, na ordem em que o layout os posiciona. */
  panels: { id: string; node: ReactNode }[];
  /** Grava a disposição para o tamanho de janela de agora. */
  onSave: (layout: PanelPlacement[]) => Promise<void> | void;
}

export function DashboardGrid({ layout, panels, onSave }: Props) {
  // A v2 mede a largura por hook em vez do antigo WidthProvider.
  const { width, mounted, containerRef } = useContainerWidth();
  const [dragging, setDragging] = useState(false);
  const [narrow, setNarrow] = useState(false);
  // O botão é a única entrada do modo: deixa preso até a pessoa desligar, e
  // funciona igual em tela de toque, onde não há tecla para segurar.
  const [pinned, setPinned] = useState(false);
  // O que está sendo arrastado, ainda não gravado. Enquanto existe, é ele que
  // a grade desenha — arrastar deixou de gravar sozinho.
  const [rascunho, setRascunho] = useState<PanelPlacement[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  // `dragging` mantém o modo de pé enquanto um arrasto está em andamento,
  // para desligar o botão no meio não deixar o painel no ar.
  const arranging = dragging || pinned;

  // O tamanho da janela aparece no aviso para a gravação não ser cega: você
  // vê para qual tela está guardando antes de clicar.
  const [janela, setJanela] = useState({ largura: 0, altura: 0 });
  useEffect(() => {
    const medir = () => setJanela({ largura: window.innerWidth, altura: window.innerHeight });
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT}px)`);
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // A lista de painéis é reconstruída a cada render da página, então comparar
  // por identidade daria um array novo toda vez. A chave é o conteúdo.
  const panelIds = useMemo(() => panels.map((p) => p.id).join(','), [panels]);

  // `layout` precisa manter a mesma referência entre renders: a grade
  // re-sincroniza quando a prop muda, e um arrasto em andamento morria no
  // primeiro render — que é justamente o que `onDragStart` provoca.
  const visible = useMemo(
    () => layoutFor(rascunho ?? layout, panelIds.split(',')),
    [rascunho, layout, panelIds],
  );

  // A grade emite mudança também ao montar e ao medir a largura. Tratar isso
  // como edição marcaria a disposição como mexida sem ninguém ter arrastado.
  //
  // A comparação usa `serializeLayout` dos dois lados: comparar JSON.stringify
  // direto dava diferença por ordem de chaves — o objeto vindo da grade e o
  // do estado têm os mesmos valores em ordem distinta — e toda montagem
  // parecia uma mudança.
  const ultimo = useRef<string>('');
  useEffect(() => {
    ultimo.current = serializeLayout(layoutFor(layout, panelIds.split(',')));
  }, [layout, panelIds]);

  const handleChange = useCallback(
    (next: Layout) => {
      const limpo = parseLayout(next);
      const serializado = serializeLayout(layoutFor(limpo, panelIds.split(',')));
      if (serializado === ultimo.current) return;
      ultimo.current = serializado;
      setRascunho(limpo);
    },
    [panelIds],
  );

  const salvar = async () => {
    if (!rascunho) {
      // Entrou no modo e não mexeu em nada: fixar a disposição atual para
      // esta tela ainda é uma escolha legítima.
      setSalvando(true);
      await onSave(layout);
      setSalvando(false);
      setPinned(false);
      return;
    }
    setSalvando(true);
    await onSave(rascunho);
    setSalvando(false);
    setRascunho(null);
    setPinned(false);
  };

  const descartar = () => {
    setRascunho(null);
    setPinned(false);
  };

  // Objetos de configuração recriados a cada render provocam a mesma
  // re-sincronização que matava o arrasto.
  const gridConfig = useMemo(
    () => ({
      cols: GRID_COLUMNS,
      rowHeight: GRID_ROW_HEIGHT,
      margin: [24, 24] as [number, number],
      containerPadding: [0, 0] as [number, number],
    }),
    [],
  );
  const dragConfig = useMemo(
    () => ({
      enabled: arranging,
      // Controles interativos nunca iniciam arrasto: sem isto, redimensionar
      // um textarea viraria mover o painel.
      cancel: 'input, textarea, select, button, a',
    }),
    [arranging],
  );
  const resizeConfig = useMemo(
    () => ({ enabled: arranging, handles: ['se'] as const }),
    [arranging],
  );

  if (narrow) {
    // Numa tela estreita não há espaço para grade. Os painéis caem numa
    // coluna, na ordem em que estão dispostos.
    const ordenados = [...visible].sort((a, b) => a.y - b.y || a.x - b.x);
    return (
      <div className="col">
        {ordenados.map((p) => panels.find((painel) => painel.id === p.i)?.node)}
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <div className="grid-bar">
        <p className={`grid-hint${arranging ? ' is-on' : ''}`} role="status">
          {arranging
            ? `Arraste para mover, puxe o canto para redimensionar. Salvar guarda para ${janela.largura} × ${janela.altura}.`
            : ''}
        </p>
        {arranging ? (
          <div className="grid-bar-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={salvando}
              onClick={() => void salvar()}
            >
              {salvando ? 'Salvando…' : 'Salvar para esta tela'}
            </button>
            <button type="button" className="btn" onClick={descartar}>
              Descartar
            </button>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => setPinned(true)}>
            Organizar
          </button>
        )}
      </div>

      {mounted && (
      <GridLayout
        className={`dashboard-grid${arranging ? ' is-arranging' : ''}`}
        width={width}
        layout={visible}
        gridConfig={gridConfig}
        // Fora do modo de organizar, o painel é conteúdo comum: clicar num
        // e-mail, marcar uma tarefa e selecionar texto continuam funcionando.
        dragConfig={dragConfig}
        resizeConfig={resizeConfig}
        onLayoutChange={handleChange}
        onDragStart={() => setDragging(true)}
        // `onDrag` e `onResize` precisam existir mesmo sem fazer nada: com o
        // limiar de 3px, a grade adia o início do arrasto para dentro deles
        // (`if (!onDragProp || !dragging) return`). Sem passá-los, o limiar
        // nunca é ultrapassado e o painel não sai do lugar.
        onDrag={naoFazNada}
        onDragStop={() => setDragging(false)}
        onResizeStart={() => setDragging(true)}
        onResize={naoFazNada}
        onResizeStop={() => setDragging(false)}
      >
        {visible.map((p) => (
          <div
            key={p.i}
            className="grid-panel"
            data-grid={{ ...p, minW: MIN_PANEL_WIDTH, minH: MIN_PANEL_HEIGHT }}
          >
            <div className="grid-panel-body">
              {panels.find((painel) => painel.id === p.i)?.node}
            </div>
          </div>
        ))}
      </GridLayout>
      )}
    </div>
  );
}
