import { MODULE_IDS, type ModuleId } from './modules';

// Posição e tamanho de cada painel na grade. É o que fica guardado por
// usuário: uma pessoa que arruma a tela num monitor ultrawide não quer a
// mesma disposição de quem usa notebook, e ninguém quer refazer isso a cada
// login.

export interface PanelPlacement {
  /** Id do painel. Coincide com o id do módulo. */
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const GRID_COLUMNS = 12;
/** Altura de uma unidade da grade, em pixels. */
export const GRID_ROW_HEIGHT = 32;
export const MIN_PANEL_WIDTH = 3;
export const MIN_PANEL_HEIGHT = 4;

/** Painéis que a grade posiciona. O pomodoro e o relógio ficam de fora: são
 *  a faixa fixa do topo, não um cartão que se arrasta. */
export const PANEL_IDS: ModuleId[] = MODULE_IDS;

// A disposição inicial repete o que a tela sempre teve: e-mail e tarefas na
// coluna larga, agenda, Jira e PRs na estreita. Quem nunca arrastar nada não
// percebe que a grade existe.
const DEFAULT: PanelPlacement[] = [
  { i: 'email', x: 0, y: 0, w: 7, h: 14 },
  { i: 'tasks', x: 0, y: 14, w: 7, h: 12 },
  { i: 'agenda', x: 7, y: 0, w: 5, h: 9 },
  { i: 'jira', x: 7, y: 9, w: 5, h: 12 },
  { i: 'pulls', x: 7, y: 21, w: 5, h: 5 },
];

export function defaultLayout(): PanelPlacement[] {
  return DEFAULT.map((p) => ({ ...p }));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitize(raw: unknown): PanelPlacement | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.i !== 'string' || !(PANEL_IDS as string[]).includes(p.i)) return null;
  if (![p.x, p.y, p.w, p.h].every(isFiniteNumber)) return null;

  // Um valor absurdo — vindo de um banco editado à mão, de uma versão antiga
  // ou de um cliente adulterado — não pode empurrar o painel para fora da
  // tela nem travar o navegador com uma altura gigante.
  const w = Math.min(Math.max(Math.round(p.w as number), MIN_PANEL_WIDTH), GRID_COLUMNS);
  const x = Math.min(Math.max(Math.round(p.x as number), 0), GRID_COLUMNS - w);
  return {
    i: p.i,
    x,
    w,
    y: Math.max(Math.round(p.y as number), 0),
    h: Math.min(Math.max(Math.round(p.h as number), MIN_PANEL_HEIGHT), 80),
  };
}

/**
 * Lê o layout guardado e devolve algo que a grade sempre consegue desenhar.
 * Um painel novo, acrescentado numa versão posterior, não existe no layout
 * que a pessoa gravou — ele entra com a posição padrão em vez de sumir.
 */
export function parseLayout(raw: unknown): PanelPlacement[] {
  const lista = Array.isArray(raw) ? raw : [];
  const guardados = new Map<string, PanelPlacement>();
  for (const item of lista) {
    const limpo = sanitize(item);
    if (limpo) guardados.set(limpo.i, limpo);
  }

  const padrao = defaultLayout();
  return padrao.map((p) => guardados.get(p.i) ?? p);
}

export function serializeLayout(layout: PanelPlacement[]): string {
  const limpo = layout
    .map(sanitize)
    .filter((p): p is PanelPlacement => p !== null)
    .map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
  return JSON.stringify(limpo);
}

/** Só os painéis que o usuário ligou entram na grade. */
export function layoutFor(layout: PanelPlacement[], enabled: string[]): PanelPlacement[] {
  return layout.filter((p) => enabled.includes(p.i));
}

export function isDefaultLayout(layout: PanelPlacement[]): boolean {
  return serializeLayout(layout) === serializeLayout(defaultLayout());
}
