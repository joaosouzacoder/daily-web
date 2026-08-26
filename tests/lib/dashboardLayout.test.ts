import { describe, expect, it } from 'vitest';
import {
  GRID_COLUMNS,
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
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
