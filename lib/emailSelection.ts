/**
 * A seleção da lista de e-mails, como a de um gerenciador de arquivos: clique
 * troca, ctrl/cmd+clique soma ou tira, Shift+clique marca a faixa, e as setas
 * andam pela lista com Shift estendendo.
 *
 * Puro de propósito: a regra de seleção é onde um cliente de e-mail erra
 * calado (a faixa que parte do lugar errado, a seleção que sobra numa linha
 * que já sumiu), e aqui ela pode ser exercitada sem tela.
 */

export interface SelectionState {
  /** Na ordem da lista, sem repetição. */
  selected: string[];
  /** De onde uma faixa parte. É o último clique sem Shift. */
  anchor: string | null;
  /** Onde o teclado está. Anda com as setas e com o clique. */
  cursor: string | null;
}

export const EMPTY_SELECTION: SelectionState = { selected: [], anchor: null, cursor: null };

export type SelectionEvent =
  | { type: 'click'; id: string; shift?: boolean; meta?: boolean }
  | { type: 'toggle'; id: string }
  | { type: 'move'; direction: 1 | -1; extend?: boolean }
  | { type: 'all' }
  | { type: 'clear' }
  /** A lista mudou: o que não está mais nela sai da seleção. */
  | { type: 'sync' };

/** Na ordem da lista: a seleção é lida e mostrada nessa ordem, e uma ordem de
 *  clique daria um lote embaralhado a quem for aplicá-lo. */
function naOrdem(ids: Iterable<string>, ordem: string[]): string[] {
  const conjunto = new Set(ids);
  return ordem.filter((id) => conjunto.has(id));
}

function faixa(ordem: string[], de: string, ate: string): string[] {
  const i = ordem.indexOf(de);
  const j = ordem.indexOf(ate);
  if (i === -1 || j === -1) return [];
  return i <= j ? ordem.slice(i, j + 1) : ordem.slice(j, i + 1);
}

function mesmaLista(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

export function selectionReducer(
  state: SelectionState,
  event: SelectionEvent,
  ordem: string[],
): SelectionState {
  switch (event.type) {
    case 'click': {
      // Sem âncora, Shift não tem de onde partir e o clique vale por si.
      if (event.shift && state.anchor !== null) {
        const entre = faixa(ordem, state.anchor, event.id);
        const base = event.meta ? [...state.selected, ...entre] : entre;
        return { selected: naOrdem(base, ordem), anchor: state.anchor, cursor: event.id };
      }

      if (event.meta) {
        const atual = new Set(state.selected);
        if (atual.has(event.id)) atual.delete(event.id);
        else atual.add(event.id);
        return { selected: naOrdem(atual, ordem), anchor: event.id, cursor: event.id };
      }

      return { selected: [event.id], anchor: event.id, cursor: event.id };
    }

    case 'toggle': {
      const atual = new Set(state.selected);
      if (atual.has(event.id)) atual.delete(event.id);
      else atual.add(event.id);
      return { selected: naOrdem(atual, ordem), anchor: event.id, cursor: event.id };
    }

    case 'move': {
      if (ordem.length === 0) return state;
      const atual = state.cursor === null ? -1 : ordem.indexOf(state.cursor);
      // Nas pontas o cursor para. Dar a volta faria a pessoa perder de vista
      // onde estava numa lista que não cabe na tela.
      const destino =
        atual === -1
          ? event.direction === 1
            ? 0
            : ordem.length - 1
          : Math.min(Math.max(atual + event.direction, 0), ordem.length - 1);
      const id = ordem[destino];

      if (event.extend && state.anchor !== null) {
        return { selected: faixa(ordem, state.anchor, id), anchor: state.anchor, cursor: id };
      }
      return { selected: [id], anchor: id, cursor: id };
    }

    case 'all':
      return { selected: [...ordem], anchor: ordem[0] ?? null, cursor: ordem.at(-1) ?? null };

    case 'clear':
      return EMPTY_SELECTION;

    case 'sync': {
      const selected = naOrdem(state.selected, ordem);
      const anchor = state.anchor !== null && ordem.includes(state.anchor) ? state.anchor : null;
      const cursor = state.cursor !== null && ordem.includes(state.cursor) ? state.cursor : null;
      // Objeto novo só quando algo mudou de verdade: um a cada ciclo do
      // painel faria a lista repintar sozinha.
      if (mesmaLista(selected, state.selected) && anchor === state.anchor && cursor === state.cursor) {
        return state;
      }
      return { selected, anchor, cursor };
    }
  }
}
