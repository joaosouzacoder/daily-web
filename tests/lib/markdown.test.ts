import { describe, expect, it } from 'vitest';
import {
  codeLines,
  lineInfo,
  parseInline,
  sourceOf,
  sourceOffset,
  toAbsolute,
  toLineOffset,
  visibleMap,
  visibleOf,
} from '@/lib/markdown';
import type { Inline } from '@/lib/markdown';

/** Os estilos aplicados, na ordem em que aparecem. */
function styles(nodes: Inline[]): string[] {
  return nodes.flatMap((n) => {
    if (n.kind === 'wrap') return [n.style, ...styles(n.children)];
    if (n.kind === 'link') return ['link', ...styles(n.children)];
    return [];
  });
}

describe('parseInline', () => {
  // A árvore precisa ser sem perda: o editor desenha a mesma linha com os
  // sinais à vista e sem, e conta caracteres nas duas formas. Perder um sinal
  // aqui desalinharia o cursor.
  it('a fonte reconstruída é igual ao texto original', () => {
    for (const texto of [
      'texto simples',
      '**negrito** e *itálico*',
      '***tudo*** ~~riscado~~ ==destaque==',
      'use `código` aqui',
      'veja [o painel](https://exemplo.test) agora',
      'escape \\*literal\\*',
      '2 * 3 * 4',
      'tb_gamification_rewards',
      '',
    ]) {
      expect(sourceOf(parseInline(texto)), JSON.stringify(texto)).toBe(texto);
    }
  });

  it('o visível é o texto sem os sinais', () => {
    expect(visibleOf(parseInline('**negrito** e *itálico*'))).toBe('negrito e itálico');
    expect(visibleOf(parseInline('use `código`'))).toBe('use código');
    expect(visibleOf(parseInline('[rótulo](https://x.test)'))).toBe('rótulo');
    expect(visibleOf(parseInline('escape \\*literal\\*'))).toBe('escape *literal*');
  });

  it('reconhece negrito, itálico, riscado e destaque', () => {
    expect(styles(parseInline('**a**'))).toEqual(['strong']);
    expect(styles(parseInline('__a__'))).toEqual(['strong']);
    expect(styles(parseInline('*a*'))).toEqual(['em']);
    expect(styles(parseInline('_a_'))).toEqual(['em']);
    expect(styles(parseInline('~~a~~'))).toEqual(['strike']);
    expect(styles(parseInline('==a=='))).toEqual(['mark']);
  });

  // `***` precisa ser tentado antes de `**`, senão o menor come o maior.
  it('trata *** como negrito com itálico', () => {
    expect(styles(parseInline('***tudo***'))).toEqual(['strongEm']);
  });

  it('aceita marcação dentro de marcação', () => {
    expect(styles(parseInline('**com *itálico* dentro**'))).toEqual(['strong', 'em']);
  });

  // É o estado normal de quem acabou de digitar o primeiro dos dois sinais.
  it('deixa como texto o delimitador sem par', () => {
    expect(parseInline('só **um')).toEqual([{ kind: 'text', text: 'só **um' }]);
  });

  // Sem a regra de flanqueamento do CommonMark, uma multiplicação escrita na
  // nota viraria itálico.
  it('não formata quando há espaço colado ao sinal', () => {
    expect(styles(parseInline('2 * 3 * 4'))).toEqual([]);
    expect(styles(parseInline('a ** b ** c'))).toEqual([]);
  });

  // Nome de tabela e de variável com sublinhado é o caso comum aqui.
  it('não formata sublinhado no meio de uma palavra', () => {
    expect(styles(parseInline('tb_gamification_rewards'))).toEqual([]);
    expect(styles(parseInline('_isolado_'))).toEqual(['em']);
  });

  it('não formata nada dentro de código', () => {
    expect(parseInline('use `**isto**`')[1]).toEqual({
      kind: 'code',
      marker: '`',
      text: '**isto**',
    });
  });

  it('reconhece link e guarda o endereço', () => {
    const [node] = parseInline('[Jira](https://acme.atlassian.net)');
    expect(node).toMatchObject({ kind: 'link', href: 'https://acme.atlassian.net' });
  });

  // O React não executaria o href, mas um link morto é pior do que o texto
  // original à vista: quem lê precisa ver o que estava escrito.
  it('não faz link de esquema que não seja http, https ou mailto', () => {
    expect(styles(parseInline('[x](javascript:alert(1))'))).toEqual([]);
    expect(styles(parseInline('[x](mailto:eu@acme.com)'))).toEqual(['link']);
  });
});

describe('lineInfo', () => {
  it('reconhece os seis níveis de título, e o sinal fica no marcador', () => {
    for (let n = 1; n <= 6; n += 1) {
      const info = lineInfo(`${'#'.repeat(n)} Título`);
      expect(info).toMatchObject({ kind: 'heading', level: n, content: 'Título' });
      expect(info.marker).toBe(`${'#'.repeat(n)} `);
    }
  });

  // Sem espaço depois do `#` não é título: é o que o CommonMark diz, e é o que
  // salva uma nota que começa com "#1 da fila".
  it('não faz título sem espaço depois do sinal', () => {
    expect(lineInfo('#1 da fila').kind).toBe('paragraph');
  });

  it('reconhece a divisória em suas três formas', () => {
    for (const linha of ['---', '***', '___']) {
      expect(lineInfo(linha), linha).toMatchObject({ kind: 'rule', marker: linha });
    }
  });

  it('reconhece citação e guarda o conteúdo sem o sinal', () => {
    expect(lineInfo('> importante')).toMatchObject({
      kind: 'quote',
      marker: '> ',
      content: 'importante',
    });
  });

  it('reconhece lista com marcador e lista numerada', () => {
    expect(lineInfo('- um')).toMatchObject({ kind: 'bullet', marker: '- ', content: 'um' });
    expect(lineInfo('3. três')).toMatchObject({ kind: 'ordered', marker: '3. ', content: 'três' });
  });

  it('reconhece caixa de marcar, marcada e vazia', () => {
    expect(lineInfo('- [ ] fazer')).toMatchObject({
      kind: 'task',
      checked: false,
      marker: '- [ ] ',
      content: 'fazer',
    });
    expect(lineInfo('- [x] feito')).toMatchObject({ kind: 'task', checked: true, content: 'feito' });
  });

  it('conta o nível de aninhamento pelo recuo', () => {
    expect(lineInfo('- raiz').depth).toBe(0);
    expect(lineInfo('  - filho').depth).toBe(1);
    expect(lineInfo('    - neto').depth).toBe(2);
  });

  it('dentro de bloco de código nada é marcação', () => {
    expect(lineInfo('# não é título', true)).toMatchObject({ kind: 'code', marker: '' });
    expect(lineInfo('- nem lista', true).kind).toBe('code');
  });
});

describe('codeLines', () => {
  it('marca as linhas do bloco cercado, cercas inclusive', () => {
    expect(codeLines(['antes', '```sql', 'SELECT 1', '```', 'depois'])).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  // Enquanto a pessoa digita, a cerca de fechamento ainda não existe.
  it('bloco sem fechamento vai até o fim', () => {
    expect(codeLines(['```', 'a', 'b'])).toEqual([true, true, true]);
  });

  it('linha em branco dentro do bloco continua sendo do bloco', () => {
    expect(codeLines(['```', '', '```'])).toEqual([true, true, true]);
  });
});

// O dicionário que o editor usa quando o cursor entra numa linha que estava
// formatada: sem ele o cursor saltaria alguns caracteres a cada mudança de
// linha, porque revelar os sinais muda o texto sob o cursor.
describe('visibleMap', () => {
  it('mapeia cada caractere visível para a sua posição no texto cru', () => {
    // '# Oi' -> visível 'Oi', que está em 2 e 3.
    expect(visibleMap('# Oi')).toEqual([2, 3]);
  });

  it('salta os delimitadores de negrito', () => {
    // '**ab**' -> visível 'ab', em 2 e 3.
    expect(visibleMap('**ab**')).toEqual([2, 3]);
  });

  it('salta o marcador da lista e o da caixa de marcar', () => {
    expect(visibleMap('- ab')).toEqual([2, 3]);
    expect(visibleMap('- [x] ab')).toEqual([6, 7]);
  });

  it('a divisória não tem caractere visível', () => {
    expect(visibleMap('---')).toEqual([]);
  });

  it('dentro do código tudo é visível', () => {
    expect(visibleMap('# nada', true)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('no escape, a barra não aparece e o caractere sim', () => {
    // '\\*x' -> visível '*x', em 1 e 2.
    expect(visibleMap('\\*x')).toEqual([1, 2]);
  });

  it('a quantidade de visíveis casa com o texto desenhado', () => {
    for (const linha of [
      '## Título **forte**',
      '- [ ] tarefa com `código`',
      '> citação com [link](https://x.test)',
      'texto simples',
    ]) {
      const info = lineInfo(linha);
      const desenhado = visibleOf(parseInline(info.content));
      expect(visibleMap(linha).length, linha).toBe(desenhado.length);
    }
  });
});

describe('sourceOffset', () => {
  it('traduz a posição da tela para a posição no texto cru', () => {
    expect(sourceOffset('# Oi', 0)).toBe(2);
    expect(sourceOffset('# Oi', 1)).toBe(3);
  });

  it('além do fim, cai no fim da linha crua', () => {
    expect(sourceOffset('# Oi', 9)).toBe(4);
  });

  it('numa linha sem visíveis, cai no fim', () => {
    expect(sourceOffset('---', 0)).toBe(3);
  });
});

describe('coordenadas do documento', () => {
  const linhas = ['abc', 'de', '', 'f'];

  it('vai de linha e deslocamento para posição absoluta', () => {
    expect(toAbsolute(linhas, 0, 0)).toBe(0);
    expect(toAbsolute(linhas, 0, 3)).toBe(3);
    expect(toAbsolute(linhas, 1, 0)).toBe(4);
    expect(toAbsolute(linhas, 2, 0)).toBe(7);
    // 'abc\nde\n\nf' tem 9 caracteres: o fim da última linha é 9.
    expect(toAbsolute(linhas, 3, 1)).toBe(9);
  });

  it('e volta', () => {
    for (let abs = 0; abs <= 9; abs += 1) {
      const { line, offset } = toLineOffset(linhas, abs);
      expect(toAbsolute(linhas, line, offset), `abs ${abs}`).toBe(abs);
    }
  });

  it('posição além do texto cai no fim da última linha', () => {
    expect(toLineOffset(linhas, 999)).toEqual({ line: 3, offset: 1 });
    expect(linhas.join('\n')).toHaveLength(9);
  });
});
