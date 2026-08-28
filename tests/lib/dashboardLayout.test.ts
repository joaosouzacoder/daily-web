import { describe, expect, it } from 'vitest';
import {
  GRID_COLUMNS,
  MAX_SIZED_LAYOUTS,
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
  nearestLayout,
  parseSizedLayouts,
  putSizedLayout,
  serializeSizedLayouts,
  type SizedLayout,
  defaultLayout,
  isDefaultLayout,
  layoutFor,
  parseLayout,
  serializeLayout,
} from '@/lib/dashboardLayout';

describe('defaultLayout', () => {
  it('posiciona todos os painéis dentro da grade', () => {
    for (const p of defaultLayout()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(GRID_COLUMNS);
      expect(p.w).toBeGreaterThanOrEqual(MIN_PANEL_WIDTH);
      expect(p.h).toBeGreaterThanOrEqual(MIN_PANEL_HEIGHT);
    }
  });

  it('devolve uma cópia, para quem mexer não corromper o padrão', () => {
    const a = defaultLayout();
    a[0].x = 99;
    expect(defaultLayout()[0].x).not.toBe(99);
  });
});

describe('parseLayout', () => {
  it('lê um layout gravado', () => {
    const guardado = [{ i: 'email', x: 4, y: 2, w: 5, h: 10 }];
    expect(parseLayout(guardado).find((p) => p.i === 'email')).toEqual({
      i: 'email', x: 4, y: 2, w: 5, h: 10,
    });
  });

  // Um painel acrescentado numa versão posterior não existe no layout que a
  // pessoa gravou; sem isto ele sumiria da tela em vez de aparecer.
  it('completa com o padrão o painel ausente do que foi gravado', () => {
    const layout = parseLayout([{ i: 'email', x: 0, y: 0, w: 6, h: 10 }]);
    expect(layout.map((p) => p.i).sort()).toEqual(defaultLayout().map((p) => p.i).sort());
  });

  it('ignora painel desconhecido', () => {
    const layout = parseLayout([{ i: 'inventado', x: 0, y: 0, w: 4, h: 5 }]);
    expect(layout.some((p) => p.i === 'inventado')).toBe(false);
  });

  // Vindo de banco editado à mão ou de cliente adulterado.
  it('prende valores absurdos dentro da grade', () => {
    const [email] = parseLayout([{ i: 'email', x: 999, y: -5, w: 999, h: 9999 }]).filter(
      (p) => p.i === 'email',
    );
    expect(email.w).toBe(GRID_COLUMNS);
    expect(email.x).toBe(0);
    expect(email.y).toBe(0);
    expect(email.h).toBeLessThanOrEqual(80);
  });

  it('respeita o tamanho mínimo', () => {
    const [email] = parseLayout([{ i: 'email', x: 0, y: 0, w: 0, h: 0 }]).filter(
      (p) => p.i === 'email',
    );
    expect(email.w).toBe(MIN_PANEL_WIDTH);
    expect(email.h).toBe(MIN_PANEL_HEIGHT);
  });

  it('não deixa o painel passar da borda direita', () => {
    const [email] = parseLayout([{ i: 'email', x: 10, y: 0, w: 6, h: 8 }]).filter(
      (p) => p.i === 'email',
    );
    expect(email.x + email.w).toBeLessThanOrEqual(GRID_COLUMNS);
  });

  it('sobrevive a lixo', () => {
    for (const ruim of [null, undefined, 'texto', 42, {}, [null], [{ i: 'email' }]]) {
      expect(parseLayout(ruim)).toHaveLength(defaultLayout().length);
    }
  });
});

describe('serializeLayout', () => {
  it('ida e volta preserva o layout', () => {
    const original = defaultLayout();
    expect(parseLayout(JSON.parse(serializeLayout(original)))).toEqual(original);
  });

  it('grava só os campos da grade, sem carregar lixo do cliente', () => {
    const comExtra = [{ i: 'email', x: 0, y: 0, w: 6, h: 10, moved: true, static: false }];
    expect(JSON.parse(serializeLayout(comExtra as never))).toEqual([
      { i: 'email', x: 0, y: 0, w: 6, h: 10 },
    ]);
  });
});

describe('layoutFor', () => {
  it('mostra só os painéis dos módulos ligados', () => {
    const visivel = layoutFor(defaultLayout(), ['email', 'jira']);
    expect(visivel.map((p) => p.i).sort()).toEqual(['email', 'jira']);
  });

  it('devolve vazio quando nada está ligado', () => {
    expect(layoutFor(defaultLayout(), [])).toEqual([]);
  });
});

describe('isDefaultLayout', () => {
  it('reconhece o padrão e uma mudança', () => {
    expect(isDefaultLayout(defaultLayout())).toBe(true);
    const mexido = defaultLayout();
    mexido[0] = { ...mexido[0], x: 5 };
    expect(isDefaultLayout(mexido)).toBe(false);
  });
});

describe('disposições por tamanho de tela', () => {
  const disp = (i: string) => [{ i, x: 0, y: 0, w: 6, h: 8 }];

  describe('nearestLayout', () => {
    it('devolve nada quando não há disposição gravada', () => {
      expect(nearestLayout([], 1920, 1080)).toBeNull();
    });

    it('acha o tamanho exato', () => {
      const entries: SizedLayout[] = [
        { width: 1920, height: 1080, layout: disp('email') },
        { width: 1512, height: 945, layout: disp('jira') },
      ];
      expect(nearestLayout(entries, 1512, 945)?.layout[0].i).toBe('jira');
    });

    // O caso que faz a diferença: abrir o DevTools ou a barra de favoritos
    // muda a altura e não pode devolver a pessoa ao layout padrão.
    it('escolhe o mais próximo quando nada bate exato', () => {
      const entries: SizedLayout[] = [
        { width: 1920, height: 1080, layout: disp('email') },
        { width: 1512, height: 945, layout: disp('jira') },
      ];
      expect(nearestLayout(entries, 1920, 1040)?.layout[0].i).toBe('email');
      expect(nearestLayout(entries, 1500, 900)?.layout[0].i).toBe('jira');
    });

    it('leva largura e altura em conta, não só a largura', () => {
      const entries: SizedLayout[] = [
        { width: 1600, height: 400, layout: disp('email') },
        { width: 1500, height: 1000, layout: disp('jira') },
      ];
      expect(nearestLayout(entries, 1590, 990)?.layout[0].i).toBe('jira');
    });

    // Sem gravação para tela pequena, a de tela grande ainda é melhor palpite
    // que o padrão: a grade tem doze colunas em qualquer tamanho.
    it('usa a única gravada mesmo numa tela bem diferente', () => {
      const entries: SizedLayout[] = [{ width: 3440, height: 1440, layout: disp('email') }];
      expect(nearestLayout(entries, 1280, 800)?.layout[0].i).toBe('email');
    });

    it('empate fica com a gravada mais recentemente', () => {
      const entries: SizedLayout[] = [
        { width: 1000, height: 1000, layout: disp('email') },
        { width: 1000, height: 1000, layout: disp('jira') },
      ];
      expect(nearestLayout(entries, 900, 900)?.layout[0].i).toBe('email');
    });
  });

  describe('putSizedLayout', () => {
    it('grava o primeiro tamanho', () => {
      const depois = putSizedLayout([], 1920, 1080, disp('email'));
      expect(depois).toHaveLength(1);
      expect(depois[0]).toMatchObject({ width: 1920, height: 1080 });
    });

    it('salvar de novo no mesmo tamanho substitui em vez de acumular', () => {
      const antes = putSizedLayout([], 1920, 1080, disp('email'));
      const depois = putSizedLayout(antes, 1920, 1080, disp('jira'));

      expect(depois).toHaveLength(1);
      expect(depois[0].layout[0].i).toBe('jira');
    });

    it('um tamanho novo convive com os anteriores', () => {
      const antes = putSizedLayout([], 1920, 1080, disp('email'));
      const depois = putSizedLayout(antes, 1512, 945, disp('jira'));
      expect(depois.map((e) => e.width)).toEqual([1512, 1920]);
    });

    it('arredonda o tamanho, que pode vir fracionado do navegador', () => {
      const depois = putSizedLayout([], 1919.6, 1079.2, disp('email'));
      expect(depois[0]).toMatchObject({ width: 1920, height: 1079 });
    });

    // A preferência não pode crescer sem fim.
    it('descarta o mais antigo ao passar do teto', () => {
      let entries: SizedLayout[] = [];
      for (let i = 0; i < MAX_SIZED_LAYOUTS + 5; i += 1) {
        entries = putSizedLayout(entries, 1000 + i, 800, disp('email'));
      }
      expect(entries).toHaveLength(MAX_SIZED_LAYOUTS);
      // O mais recente fica; o primeiro gravado saiu.
      expect(entries[0].width).toBe(1000 + MAX_SIZED_LAYOUTS + 4);
      expect(entries.some((e) => e.width === 1000)).toBe(false);
    });
  });

  describe('parseSizedLayouts', () => {
    it('aceita o que foi serializado', () => {
      const entries = putSizedLayout([], 1920, 1080, disp('email'));
      expect(parseSizedLayouts(JSON.parse(serializeSizedLayouts(entries)))).toHaveLength(1);
    });

    it('descarta entrada sem tamanho utilizável', () => {
      expect(
        parseSizedLayouts([
          { width: 0, height: 100, layout: [] },
          { width: -5, height: 100, layout: [] },
          { width: 'grande', height: 100, layout: [] },
          { width: 1920, height: 1080, layout: [] },
        ]),
      ).toHaveLength(1);
    });

    it('descarta o que não é lista', () => {
      expect(parseSizedLayouts(null)).toEqual([]);
      expect(parseSizedLayouts('nada')).toEqual([]);
      expect(parseSizedLayouts({ width: 1 })).toEqual([]);
    });

    it('não guarda o mesmo tamanho duas vezes', () => {
      const saida = parseSizedLayouts([
        { width: 1920, height: 1080, layout: [] },
        { width: 1920, height: 1080, layout: [] },
      ]);
      expect(saida).toHaveLength(1);
    });

    // O painel que não existia quando a pessoa gravou entra na posição padrão
    // em vez de sumir — é o mesmo cuidado do parseLayout.
    it('completa a disposição com os painéis que faltam', () => {
      const saida = parseSizedLayouts([{ width: 1920, height: 1080, layout: disp('email') }]);
      expect(saida[0].layout.map((p) => p.i).sort()).toEqual(defaultLayout().map((p) => p.i).sort());
    });
  });
});
