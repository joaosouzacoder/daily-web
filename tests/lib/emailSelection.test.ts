import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, selectionReducer, type SelectionState } from '@/lib/emailSelection';

const ORDEM = ['a', 'b', 'c', 'd', 'e'];

function reduzir(state: SelectionState, ...eventos: Parameters<typeof selectionReducer>[1][]) {
  return eventos.reduce((atual, evento) => selectionReducer(atual, evento, ORDEM), state);
}

describe('clique simples', () => {
  it('seleciona só a linha clicada', () => {
    const state = reduzir(EMPTY_SELECTION, { type: 'click', id: 'b' });
    expect(state.selected).toEqual(['b']);
    expect(state.anchor).toBe('b');
  });

  // Clicar noutra linha troca a seleção; não acumula.
  it('troca a seleção em vez de somar', () => {
    const state = reduzir(
      EMPTY_SELECTION,
      { type: 'click', id: 'b' },
      { type: 'click', id: 'd' },
    );
    expect(state.selected).toEqual(['d']);
  });
});

describe('ctrl/cmd+clique', () => {
  it('acrescenta sem tirar o que já estava', () => {
    const state = reduzir(
      EMPTY_SELECTION,
      { type: 'click', id: 'b' },
      { type: 'click', id: 'd', meta: true },
    );
    expect(state.selected).toEqual(['b', 'd']);
  });

  it('tira a linha que já estava marcada', () => {
    const state = reduzir(
      EMPTY_SELECTION,
      { type: 'click', id: 'b' },
      { type: 'click', id: 'd', meta: true },
      { type: 'click', id: 'b', meta: true },
    );
    expect(state.selected).toEqual(['d']);
  });

  // Sem âncora não há de onde partir um intervalo depois.
  it('move a âncora para a última linha tocada', () => {
    const state = reduzir(
      EMPTY_SELECTION,
      { type: 'click', id: 'b' },
      { type: 'click', id: 'd', meta: true },
    );
    expect(state.anchor).toBe('d');
  });
});

describe('shift+clique', () => {
  it('marca a faixa da âncora até a linha clicada', () => {
    const state = reduzir(
      EMPTY_SELECTION,
      { type: 'click', id: 'b' },
      { type: 'click', id: 'd', shift: true },
    );
    expect(state.selected).toEqual(['b', 'c', 'd']);
  });

  it('marca a faixa para cima também', () => {
    const state = reduzir(
      EMPTY_SELECTION,
      { type: 'click', id: 'd' },
      { type: 'click', id: 'b', shift: true },
    );
    expect(state.selected).toEqual(['b', 'c', 'd']);
  });

  // A âncora fica parada: encolher a faixa é clicar mais perto dela, não
  // começar uma faixa nova a partir de onde se clicou por último.
  it('refaz a faixa a partir da mesma âncora', () => {
    const state = reduzir(
      EMPTY_SELECTION,
      { type: 'click', id: 'b' },
      { type: 'click', id: 'e', shift: true },
      { type: 'click', id: 'c', shift: true },
    );
    expect(state.selected).toEqual(['b', 'c']);
    expect(state.anchor).toBe('b');
  });

  it('soma a faixa à seleção quando vem com ctrl/cmd', () => {
    const state = reduzir(
      EMPTY_SELECTION,
      { type: 'click', id: 'a' },
      { type: 'click', id: 'c', meta: true },
      { type: 'click', id: 'e', shift: true, meta: true },
    );
    expect(state.selected).toEqual(['a', 'c', 'd', 'e']);
  });

  // Sem clique anterior, Shift não tem de onde partir.
  it('vira clique simples quando não há âncora', () => {
    const state = reduzir(EMPTY_SELECTION, { type: 'click', id: 'c', shift: true });
    expect(state.selected).toEqual(['c']);
  });
});

describe('teclado', () => {
  it('desce e sobe uma linha por vez', () => {
    const state = reduzir(
      EMPTY_SELECTION,
      { type: 'click', id: 'b' },
      { type: 'move', direction: 1 },
    );
    expect(state.selected).toEqual(['c']);
    expect(state.cursor).toBe('c');
  });

  it('estende a seleção com shift', () => {
    const state = reduzir(
      EMPTY_SELECTION,
      { type: 'click', id: 'b' },
      { type: 'move', direction: 1, extend: true },
      { type: 'move', direction: 1, extend: true },
    );
    expect(state.selected).toEqual(['b', 'c', 'd']);
  });

  // Nas pontas o cursor para, em vez de dar a volta: passar do fim e
  // reaparecer no topo faria a pessoa perder de vista onde estava.
  it('para na primeira e na última linha', () => {
    const nofim = reduzir(
      EMPTY_SELECTION,
      { type: 'click', id: 'e' },
      { type: 'move', direction: 1 },
    );
    expect(nofim.cursor).toBe('e');

    const notopo = reduzir(
      EMPTY_SELECTION,
      { type: 'click', id: 'a' },
      { type: 'move', direction: -1 },
    );
    expect(notopo.cursor).toBe('a');
  });

  it('começa pelo topo quando nada está selecionado', () => {
    const state = reduzir(EMPTY_SELECTION, { type: 'move', direction: 1 });
    expect(state.selected).toEqual(['a']);
  });

  it('alterna a linha sob o cursor sem mexer no resto', () => {
    const state = reduzir(
      EMPTY_SELECTION,
      { type: 'click', id: 'b' },
      { type: 'move', direction: 1 },
      { type: 'toggle', id: 'c' },
    );
    expect(state.selected).toEqual([]);
  });
});

describe('selecionar tudo e limpar', () => {
  it('marca todas as linhas visíveis', () => {
    expect(reduzir(EMPTY_SELECTION, { type: 'all' }).selected).toEqual(ORDEM);
  });

  it('limpa a seleção e a âncora', () => {
    const state = reduzir(EMPTY_SELECTION, { type: 'click', id: 'b' }, { type: 'clear' });
    expect(state.selected).toEqual([]);
    expect(state.anchor).toBeNull();
  });
});

describe('a lista muda debaixo da seleção', () => {
  // O ciclo traz mensagens novas e leva as que sumiram: uma seleção que
  // guardasse o que não está mais na tela mandaria o lote para o vazio.
  it('descarta o que não está mais na lista', () => {
    const state = reduzir(EMPTY_SELECTION, { type: 'all' });
    const depois = selectionReducer(state, { type: 'sync' }, ['a', 'c']);
    expect(depois.selected).toEqual(['a', 'c']);
  });

  it('esquece a âncora que saiu da lista', () => {
    const state = reduzir(EMPTY_SELECTION, { type: 'click', id: 'e' });
    const depois = selectionReducer(state, { type: 'sync' }, ['a', 'b']);
    expect(depois.anchor).toBeNull();
  });

  // Sem lista nenhuma não há o que preservar, e recriar o objeto a cada
  // ciclo faria a tela repintar sozinha.
  it('devolve o mesmo estado quando nada mudou', () => {
    const state = reduzir(EMPTY_SELECTION, { type: 'click', id: 'b' });
    expect(selectionReducer(state, { type: 'sync' }, ORDEM)).toBe(state);
  });
});
