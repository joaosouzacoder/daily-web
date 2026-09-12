import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, MAX_MARKDOWN_LENGTH } from '@/lib/parsers/htmlToMarkdown';

describe('texto e parágrafos', () => {
  it('separa parágrafos por linha em branco', () => {
    expect(htmlToMarkdown('<p>Primeiro</p><p>Segundo</p>')).toBe('Primeiro\n\nSegundo');
  });

  it('quebra a linha no <br>', () => {
    expect(htmlToMarkdown('<p>Uma<br>Outra</p>')).toBe('Uma\nOutra');
  });

  it('devolve as entidades como os caracteres que elas representam', () => {
    expect(htmlToMarkdown('<p>caf&eacute; &amp; p&atilde;o &lt;fim&gt;</p>')).toBe(
      'café & pão <fim>',
    );
  });

  // Espaço de HTML é elástico: sem colapsar, a nota herdaria a indentação do
  // gerador do e-mail.
  it('colapsa o espaço em branco do HTML', () => {
    expect(htmlToMarkdown('<p>uma\n   frase     só</p>')).toBe('uma frase só');
  });
});

describe('formatação', () => {
  it('converte negrito e itálico', () => {
    expect(htmlToMarkdown('<p><strong>forte</strong> e <em>ênfase</em></p>')).toBe(
      '**forte** e *ênfase*',
    );
  });

  it('converte títulos', () => {
    expect(htmlToMarkdown('<h1>Um</h1><h3>Três</h3>')).toBe('# Um\n\n### Três');
  });

  it('converte listas', () => {
    expect(htmlToMarkdown('<ul><li>maçã</li><li>pera</li></ul>')).toBe('- maçã\n- pera');
  });

  it('numera a lista ordenada', () => {
    expect(htmlToMarkdown('<ol><li>um</li><li>dois</li></ol>')).toBe('1. um\n2. dois');
  });

  it('converte citação e regra horizontal', () => {
    expect(htmlToMarkdown('<blockquote><p>citado</p></blockquote><hr>')).toBe('> citado\n\n---');
  });

  it('converte código', () => {
    expect(htmlToMarkdown('<p>use <code>npm ci</code></p>')).toBe('use `npm ci`');
    expect(htmlToMarkdown('<pre>linha 1\nlinha 2</pre>')).toBe('```\nlinha 1\nlinha 2\n```');
  });
});

describe('links e imagens', () => {
  it('converte o link preservando o endereço', () => {
    expect(htmlToMarkdown('<a href="https://exemplo.com/a?b=1">clique</a>')).toBe(
      '[clique](https://exemplo.com/a?b=1)',
    );
  });

  it('deixa só o texto quando o link não tem endereço', () => {
    expect(htmlToMarkdown('<a>sem destino</a>')).toBe('sem destino');
  });

  it('converte a imagem com o texto alternativo', () => {
    expect(htmlToMarkdown('<img src="https://exemplo.com/a.png" alt="gráfico">')).toBe(
      '![gráfico](https://exemplo.com/a.png)',
    );
  });

  // O endereço vem de um e-mail, que é entrada não confiável: um `javascript:`
  // guardado na nota vira um clique perigoso mais tarde.
  it.each(['javascript:alert(1)', 'data:text/plain,oi', 'vbscript:msgbox', '//evil.com'])(
    'descarta o endereço %j e mantém o texto',
    (href) => {
      expect(htmlToMarkdown(`<a href="${href}">clique</a>`)).toBe('clique');
    },
  );

  // O que interessa é não sobrar link: um atributo com marcação dentro é HTML
  // inválido, e a varredura não é um parser — mas endereço perigoso nenhum
  // pode virar destino.
  it('não produz link a partir de um atributo malformado', () => {
    const saida = htmlToMarkdown('<a href="data:text/html,&lt;script&gt;">clique</a>');
    expect(saida).toBe('clique');
    expect(saida).not.toContain('data:');
  });

  it('aceita http, https e mailto', () => {
    expect(htmlToMarkdown('<a href="mailto:a@b.com">escreva</a>')).toBe('[escreva](mailto:a@b.com)');
    expect(htmlToMarkdown('<a href="http://x.com">x</a>')).toBe('[x](http://x.com)');
  });
});

describe('o que não pode entrar na nota', () => {
  // Nada de HTML cru: a nota é Markdown, e o editor a renderiza.
  it('não deixa passar marcação nenhuma', () => {
    const saida = htmlToMarkdown(
      '<p>oi<iframe src="https://x"></iframe><span onclick="roubar()">aqui</span></p>',
    );
    expect(saida).not.toMatch(/<[a-z]/i);
    expect(saida).not.toContain('onclick');
    expect(saida).toContain('oi');
  });

  it('descarta script e style com o conteúdo deles', () => {
    const saida = htmlToMarkdown(
      '<style>.a{color:red}</style><script>alert(1)</script><p>sobrou</p>',
    );
    expect(saida).toBe('sobrou');
  });

  // O que vier escrito com sintaxe de Markdown no e-mail não pode virar
  // formatação na nota por acidente.
  it('escapa o que pareceria marcação de Markdown', () => {
    expect(htmlToMarkdown('<p>desconto de 50% *hoje* _só_</p>')).toBe(
      'desconto de 50% \\*hoje\\* \\_só\\_',
    );
  });

  it('comentário de HTML não aparece', () => {
    expect(htmlToMarkdown('<p>antes<!-- escondido -->depois</p>')).toBe('antesdepois');
  });
});

describe('limites', () => {
  // Nada sem limite: um e-mail com megabytes de marcação não pode virar uma
  // nota que nem abre.
  it('corta o que passa do tamanho máximo', () => {
    const enorme = `<p>${'a'.repeat(MAX_MARKDOWN_LENGTH * 2)}</p>`;
    const saida = htmlToMarkdown(enorme);

    expect(saida.length).toBeLessThanOrEqual(MAX_MARKDOWN_LENGTH + 40);
    expect(saida).toMatch(/cortada/);
  });

  it('devolve vazio para entrada vazia', () => {
    expect(htmlToMarkdown('')).toBe('');
    expect(htmlToMarkdown('   ')).toBe('');
  });
});
