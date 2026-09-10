import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { SKINS, SKIN_COOKIE, applySkin, parseSkin, readSkin } from '@/lib/skins';

function limparCookies() {
  for (const par of document.cookie.split(';')) {
    const nome = par.split('=')[0].trim();
    if (nome) document.cookie = `${nome}=; path=/; max-age=0`;
  }
}

beforeEach(() => {
  delete document.documentElement.dataset.skin;
  limparCookies();
});

afterEach(() => {
  delete document.documentElement.dataset.skin;
  limparCookies();
});

describe('parseSkin', () => {
  // Mesma forma das outras dimensões de aparência: o padrão é a ausência de
  // tudo, então o que não é reconhecido é o padrão.
  it('reconhece os skins declarados', () => {
    expect(parseSkin('relief')).toBe('relief');
    expect(parseSkin('default')).toBe('default');
  });

  it('qualquer outra coisa é o padrão', () => {
    for (const bruto of [undefined, '', 'relevo', 'RELIEF', 'sei-la']) {
      expect(parseSkin(bruto), JSON.stringify(bruto)).toBe('default');
    }
  });
});

describe('applySkin', () => {
  it('estampa o skin na raiz e guarda no cookie', () => {
    applySkin('relief');
    expect(document.documentElement.dataset.skin).toBe('relief');
    expect(document.cookie).toContain(`${SKIN_COOKIE}=relief`);
  });

  // Ausência de cookie e ausência de atributo têm de querer dizer a mesma
  // coisa, senão o servidor e o cliente discordam do que é o padrão.
  it('escolher o padrão apaga o atributo e o cookie', () => {
    applySkin('relief');
    applySkin('default');
    expect(document.documentElement.dataset.skin).toBeUndefined();
    expect(document.cookie).not.toContain(`${SKIN_COOKIE}=relief`);
  });

  it('aceita outra raiz, para poder ser testado sem tocar no documento', () => {
    const outra = document.createElement('html');
    applySkin('relief', outra);
    expect(outra.dataset.skin).toBe('relief');
    expect(document.documentElement.dataset.skin).toBeUndefined();
  });
});

describe('readSkin', () => {
  it('lê da raiz, que é a verdade', () => {
    expect(readSkin()).toBe('default');
    document.documentElement.dataset.skin = 'relief';
    expect(readSkin()).toBe('relief');
  });

  it('valor desconhecido na raiz lê como padrão', () => {
    document.documentElement.dataset.skin = 'inventado';
    expect(readSkin()).toBe('default');
  });
});

describe('registro de skins', () => {
  it('o padrão é o primeiro, porque é a ordem em que a tela oferece', () => {
    expect(SKINS[0].id).toBe('default');
  });

  it('todo skin tem rótulo e explicação, que é o que a tela mostra', () => {
    for (const skin of SKINS) {
      expect(skin.label.length, skin.id).toBeGreaterThan(0);
      expect(skin.description.length, skin.id).toBeGreaterThan(0);
    }
  });

  // Cada skin declarado precisa do seu bloco de tokens, senão escolhê-lo não
  // muda nada e a tela mente sobre o que aconteceu.
  it('todo skin fora do padrão tem um bloco em globals.css', () => {
    const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
    for (const skin of SKINS) {
      if (skin.id === 'default') continue;
      expect(css, skin.id).toContain(`[data-skin='${skin.id}']`);
    }
  });

  // Erro cometido e corrigido: o corpo do painel foi mapeado para
  // `--surface-1`, que é o plano *rebaixado* da rampa (a sidebar) e no tema
  // escuro fica mais escuro que o piso. O painel virava um buraco, o relevo
  // não se lia, e o skin passava por uma cópia do padrão. Um corpo que sai da
  // página não pode nascer do nível rebaixado.
  it('o corpo do painel no relevo não vem do plano rebaixado', () => {
    const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
    const bloco = css.slice(css.indexOf("[data-skin='relief'] {"));
    const mapeamento = bloco.match(/--glass:\s*var\((--surface-\d)\)/);

    expect(mapeamento, 'o bloco do relevo precisa mapear --glass').not.toBeNull();
    expect(mapeamento![1]).not.toBe('--surface-1');
  });
});

// O contrato que torna a lista barata de crescer: um skin é só troca de token.
// No instante em que uma tela passar a se desenhar de um jeito por skin, cada
// tela nova volta a custar uma versão por skin, que é exatamente o que não se
// quer. Este teste é o que segura essa porta.
describe('nenhuma tela se ramifica por skin', () => {
  const RAIZES = ['app', 'components'];
  /** Quem tem o direito de saber qual skin está ativo: quem estampa a raiz e
   *  quem oferece a escolha. É uma categoria, não uma lista de exceções: um
   *  seletor de aparência pode entrar aqui, um módulo do painel não. */
  const PERMITIDOS = [
    'app/layout.tsx',
    'components/AppearancePanel.tsx',
    'components/shell/CommandPalette.tsx',
  ];

  function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap((nome) => {
      const completo = path.join(dir, nome);
      if (statSync(completo).isDirectory()) return arquivos(completo);
      return /\.tsx?$/.test(nome) ? [completo] : [];
    });
  }

  const fontes = RAIZES.flatMap((raiz) => arquivos(path.join(process.cwd(), raiz))).map((f) => ({
    caminho: path.relative(process.cwd(), f),
    texto: readFileSync(f, 'utf8'),
  }));

  it('só a raiz e a tela de escolha mencionam o skin', () => {
    const culpados = fontes
      .filter(({ caminho }) => !PERMITIDOS.includes(caminho))
      .filter(({ texto }) => /data-skin|dataset\.skin|from '@\/lib\/skins'/.test(texto))
      .map(({ caminho }) => caminho);

    expect(culpados).toEqual([]);
  });

  it('nenhum componente compara com o id de um skin', () => {
    const ids = SKINS.map((s) => s.id).filter((id) => id !== 'default');
    const culpados = fontes
      .filter(({ caminho }) => !PERMITIDOS.includes(caminho))
      .filter(({ texto }) => ids.some((id) => texto.includes(`'${id}'`)))
      .map(({ caminho }) => caminho);

    expect(culpados).toEqual([]);
  });
});
