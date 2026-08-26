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

/**
 * O react-draggable recusa começar um arrasto quando o Ctrl está pressionado:
 *
 *     if (!allowAnyClick && (e.button !== 0 || e.ctrlKey)) return false;
 *
 * A regra existe porque no macOS Ctrl+clique é o clique secundário, e o
 * react-grid-layout não expõe `allowAnyClick` para desligá-la. Como Ctrl+
 * arrastar é justamente a interação pedida, o mousedown é reemitido sem o
 * modificador — o modo de organizar já foi ligado pela tecla, então a
 * informação do Ctrl não é mais necessária a partir daqui.
 *
 * Só o mousedown precisa disso: o react-draggable checa o modificador uma vez,
 * no início, e depois escuta mousemove e mouseup no documento.
 */
function useCtrlDragBridge(active: boolean) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !active) return;

    let reemitindo = false;
    const capture = (e: MouseEvent) => {
      if (!e.ctrlKey || reemitindo || e.button !== 0) return;
      const alvo = e.target;
      if (!(alvo instanceof HTMLElement)) return;

      e.stopPropagation();
      e.preventDefault();
      reemitindo = true;
      alvo.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          buttons: 1,
          clientX: e.clientX,
          clientY: e.clientY,
          screenX: e.screenX,
          screenY: e.screenY,
          ctrlKey: false,
        }),
      );
      reemitindo = false;
    };

    node.addEventListener('mousedown', capture, true);
    return () => node.removeEventListener('mousedown', capture, true);
  }, [active]);

  return containerRef;
}

interface Props {
  layout: PanelPlacement[];
  /** Ids dos painéis a desenhar, na ordem em que o layout os posiciona. */
  panels: { id: string; node: ReactNode }[];
  onLayoutChange: (layout: PanelPlacement[]) => void;
}

export function DashboardGrid({ layout, panels, onLayoutChange }: Props) {
  // A v2 mede a largura por hook em vez do antigo WidthProvider.
  const { width, mounted, containerRef } = useContainerWidth();
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [narrow, setNarrow] = useState(false);
  // Em tela de toque não existe Ctrl. O botão deixa o modo preso até a pessoa
  // desligar, e serve também para quem prefere não segurar tecla nenhuma.
  const [pinned, setPinned] = useState(false);
  // Soltar o Ctrl no meio de um arrasto desligaria a grade com o painel no
  // ar. O modo só cai quando o arrasto termina.
  const arranging = ctrlHeld || dragging || pinned;
  // A ponte só fica ativa enquanto o Ctrl está de fato pressionado: fora
  // disso, nenhum mousedown deve ser tocado.
  const ctrlBridgeRef = useCtrlDragBridge(ctrlHeld);

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT}px)`);
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Control') setCtrlHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Control') setCtrlHeld(false);
    };
    // Trocar de janela com a tecla pressionada deixaria o modo ligado para
    // sempre: o keyup acontece fora e nunca chega aqui.
    const clear = () => setCtrlHeld(false);

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  // A lista de painéis é reconstruída a cada render da página, então comparar
  // por identidade daria um array novo toda vez. A chave é o conteúdo.
  const panelIds = useMemo(() => panels.map((p) => p.id).join(','), [panels]);

  // `layout` precisa manter a mesma referência entre renders: a grade
  // re-sincroniza quando a prop muda, e um arrasto em andamento morria no
  // primeiro render — que é justamente o que `onDragStart` provoca.
  const visible = useMemo(
    () => layoutFor(layout, panelIds.split(',')),
    [layout, panelIds],
  );

  // A grade emite mudança também ao montar e ao medir a largura. Gravar tudo
  // devolveria o layout ao servidor sem ninguém ter arrastado nada.
  //
  // A comparação usa `serializeLayout` dos dois lados: comparar JSON.stringify
  // direto dava diferença por ordem de chaves — o objeto vindo da grade e o
  // do estado têm os mesmos valores em ordem distinta — e toda montagem
  // parecia uma mudança.
  const ultimo = useRef<string>('');
  useEffect(() => {
    ultimo.current = serializeLayout(visible);
  }, [visible]);

  const handleChange = useCallback(
    (next: Layout) => {
      const limpo = parseLayout(next);
      const serializado = serializeLayout(layoutFor(limpo, panelIds.split(',')));
      if (serializado === ultimo.current) return;
      ultimo.current = serializado;
      onLayoutChange(limpo);
    },
    [onLayoutChange, panelIds],
  );

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
      // Controles interativos nunca iniciam arrasto, mesmo com Ctrl: sem
      // isto, redimensionar um textarea viraria mover o painel.
      cancel: 'input, textarea, select, button, a',
    }),
    [arranging],
  );
  const resizeConfig = useMemo(
    () => ({ enabled: arranging, handles: ['se'] as const }),
    [arranging],
  );

  if (narrow) {
    // Numa tela estreita não há Ctrl nem espaço para grade. Os painéis caem
    // numa coluna, na ordem em que estão dispostos.
    const ordenados = [...visible].sort((a, b) => a.y - b.y || a.x - b.x);
    return (
      <div className="col">
        {ordenados.map((p) => panels.find((painel) => painel.id === p.i)?.node)}
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <div ref={ctrlBridgeRef} className="grid-bridge">
      <div className="grid-bar">
        <p className={`grid-hint${arranging ? ' is-on' : ''}`} role="status">
          {arranging
            ? 'Arraste para mover, puxe o canto para redimensionar.'
            : 'Segure Ctrl para reorganizar os painéis.'}
        </p>
        <button
          type="button"
          className={`btn${pinned ? ' btn-primary' : ''}`}
          aria-pressed={pinned}
          onClick={() => setPinned((v) => !v)}
        >
          {pinned ? 'Concluir' : 'Organizar'}
        </button>
      </div>

      {mounted && (
      <GridLayout
        className={`dashboard-grid${arranging ? ' is-arranging' : ''}`}
        width={width}
        layout={visible}
        gridConfig={gridConfig}
        // Sem Ctrl, o painel é conteúdo comum: clicar num e-mail, marcar uma
        // tarefa e selecionar texto continuam funcionando como sempre.
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
    </div>
  );
}
