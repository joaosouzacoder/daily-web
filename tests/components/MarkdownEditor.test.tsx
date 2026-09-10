import { describe, expect, it, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MarkdownEditor } from '@/components/MarkdownEditor';

afterEach(cleanup);

const LABEL = 'texto de Ideias';

/** O editor é controlado. O invólucro guarda o texto, como o painel faz, para
 *  o teste poder falar do que a pessoa digita e não de props. */
function Editor({ inicial, onChange }: { inicial: string; onChange?: (t: string) => void }) {
  const [texto, setTexto] = useState(inicial);
  return (
    <MarkdownEditor
      value={texto}
      onChange={(t) => {
        setTexto(t);
        onChange?.(t);
      }}
      label={LABEL}
      placeholder="Escreva aqui."
    />
  );
}

const superficie = () => screen.getByRole('textbox', { name: LABEL });
const linha = (i: number) => superficie().querySelector(`[data-linha="${i}"]`) as HTMLElement;

/** Põe o cursor numa linha, contando caracteres do que está desenhado, e
 *  avisa o editor como o navegador avisaria. */
function cursorEm(indice: number, offset: number) {
  const alvo = linha(indice);
  const walker = document.createTreeWalker(alvo, NodeFilter.SHOW_TEXT);
  let restante = offset;
  let no = walker.nextNode();
  const range = document.createRange();

  while (no) {
    const tamanho = no.textContent?.length ?? 0;
    if (restante <= tamanho) {
      range.setStart(no, restante);
      break;
    }
    restante -= tamanho;
    no = walker.nextNode();
  }
  if (!no) range.setStart(alvo, 0);
  range.collapse(true);

  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

/** A escrita como o navegador a anuncia, para o editor poder recusá-la e
 *  aplicá-la ele mesmo. */
function escrever(inputType: string, data?: string) {
  act(() => {
    superficie().dispatchEvent(
      new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true }),
    );
  });
}

/** Uma seleção de trecho, da posição visível (l1,o1) até (l2,o2). */
function selecionar(l1: number, o1: number, l2: number, o2: number) {
  const ponto = (indice: number, offset: number) => {
    const alvo = linha(indice);
    const walker = document.createTreeWalker(alvo, NodeFilter.SHOW_TEXT);
    let restante = offset;
    let no = walker.nextNode();
    while (no) {
      const tamanho = no.textContent?.length ?? 0;
      if (restante <= tamanho) return { no, offset: restante };
      restante -= tamanho;
      no = walker.nextNode();
    }
    return { no: alvo as Node, offset: 0 };
  };

  const a = ponto(l1, o1);
  const b = ponto(l2, o2);
  const range = document.createRange();
  range.setStart(a.no, a.offset);
  range.setEnd(b.no, b.offset);

  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

/** Selecionar tudo, como o Cmd+A: a âncora é a própria superfície. */
function selecionarTudo() {
  const raiz = superficie();
  const range = document.createRange();
  range.setStart(raiz, 0);
  range.setEnd(raiz, raiz.childNodes.length);

  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

/** Uma área de transferência de mentira, para ler o que foi copiado. */
function prancheta() {
  const dados = new Map<string, string>();
  return {
    dados,
    setData: (tipo: string, valor: string) => dados.set(tipo, valor),
    getData: (tipo: string) => dados.get(tipo) ?? '',
  };
}

describe('MarkdownEditor', () => {
  it('é uma superfície de edição só, não um campo por linha', () => {
    render(<Editor inicial={'# Título\n\ncorpo'} />);

    expect(superficie()).toHaveAttribute('contenteditable', 'true');
    expect(superficie()).toHaveAttribute('aria-multiline', 'true');
    // Nenhum campo separado: é isso que distingue disto o comportamento do
    // Notion, onde cada bloco é um input.
    expect(superficie().querySelectorAll('textarea, input')).toHaveLength(0);
  });

  it('formata as linhas e esconde os sinais das que não têm o cursor', () => {
    render(<Editor inicial={'# Título\n\ntexto com **peso**'} />);

    // A linha 2 não tem o cursor: o `**` não aparece, o negrito sim.
    expect(linha(2).textContent).toBe('texto com peso');
    expect(screen.getByText('peso').tagName).toBe('STRONG');
  });

  // O ponto que estava errado: a formatação continua, e só os sinais surgem.
  it('a linha do cursor mostra os sinais e mantém a formatação', () => {
    render(<Editor inicial={'# Título\n\ntexto'} />);

    // O cursor começa na linha 0.
    expect(linha(0).textContent).toBe('# Título');
    expect(linha(0).querySelector('.md-sinal')?.textContent).toBe('# ');
    // Continua sendo título: o tamanho não muda ao revelar o sinal.
    expect(linha(0).querySelector('.md-h1')).toBeInTheDocument();
  });

  it('mover o cursor revela os sinais da linha nova e esconde os da antiga', () => {
    render(<Editor inicial={'# Título\n\n> citação'} />);
    expect(linha(2).textContent).toBe('citação');

    cursorEm(2, 0);

    expect(linha(2).textContent).toBe('> citação');
    expect(linha(0).textContent).toBe('Título');
  });

  it('o cursor cai no caractere certo mesmo vindo de linha formatada', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'a\n**peso** aqui'} onChange={onChange} />);

    // 'peso aqui' é o que está na tela; posição 4 é o espaço antes de 'aqui'.
    cursorEm(1, 4);
    escrever('insertText', 'X');

    // No texto cru essa posição é depois do `**` de fechamento.
    expect(onChange).toHaveBeenLastCalledWith('a\n**peso**X aqui');
  });

  it('digitar insere no lugar do cursor', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'abc'} onChange={onChange} />);

    cursorEm(0, 1);
    escrever('insertText', 'X');

    expect(onChange).toHaveBeenLastCalledWith('aXbc');
  });

  it('Enter parte a linha em duas', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'abcd'} onChange={onChange} />);

    cursorEm(0, 2);
    escrever('insertParagraph');

    expect(onChange).toHaveBeenLastCalledWith('ab\ncd');
  });

  // O caso que a pessoa citou: escrever o título e seguir escrevendo.
  it('depois do Enter, o título já aparece formatado e sem sinais', () => {
    render(<Editor inicial={'# Título'} />);

    cursorEm(0, 8);
    escrever('insertParagraph');

    // O cursor foi para a linha nova, então a de cima esconde o sinal.
    expect(linha(0).textContent).toBe('Título');
    expect(linha(0).querySelector('.md-h1')).toBeInTheDocument();
  });

  it('apagar no meio da linha remove o caractere anterior', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'abc'} onChange={onChange} />);

    cursorEm(0, 2);
    escrever('deleteContentBackward');

    expect(onChange).toHaveBeenLastCalledWith('ac');
  });

  it('apagar no começo da linha junta com a de cima', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'ab\ncd'} onChange={onChange} />);

    cursorEm(1, 0);
    escrever('deleteContentBackward');

    expect(onChange).toHaveBeenLastCalledWith('abcd');
  });

  it('apagar no fim da linha traz a de baixo', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'ab\ncd'} onChange={onChange} />);

    cursorEm(0, 2);
    escrever('deleteContentForward');

    expect(onChange).toHaveBeenLastCalledWith('abcd');
  });

  // O formato vem dos sinais no texto. Um atalho de edição rica do navegador
  // gravaria HTML dentro da superfície e não teria como voltar para o texto.
  it('recusa escrita que não seja texto', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'abc'} onChange={onChange} />);

    cursorEm(0, 1);
    escrever('formatBold');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('desfaz e refaz o que foi digitado', () => {
    render(<Editor inicial={'abc'} />);

    cursorEm(0, 3);
    escrever('insertText', 'd');
    expect(linha(0).textContent).toBe('abcd');

    fireEvent.keyDown(superficie(), { key: 'z', ctrlKey: true });
    expect(linha(0).textContent).toBe('abc');

    fireEvent.keyDown(superficie(), { key: 'z', ctrlKey: true, shiftKey: true });
    expect(linha(0).textContent).toBe('abcd');
  });

  it('desenha lista, caixa de marcar, citação e código sem os sinais', () => {
    render(<Editor inicial={'a\n- item\n- [x] feito\n> citada\n```\nSELECT 1\n```'} />);

    expect(linha(1).textContent).toBe('item');
    expect(linha(1).dataset.marcador ?? linha(1).querySelector('[data-marcador]')).toBeTruthy();
    expect(linha(2).textContent).toBe('feito');
    expect(linha(3).textContent).toBe('citada');
    // Dentro do bloco cercado o texto é literal, cercas à vista.
    expect(linha(5).textContent).toBe('SELECT 1');
    expect(linha(5).querySelector('.md-mono')).toBeInTheDocument();
  });

  it('dentro do bloco de código, o sinal de título não vira título', () => {
    render(<Editor inicial={'a\n```\n# comentário\n```'} />);

    expect(linha(2).textContent).toBe('# comentário');
    expect(linha(2).querySelector('.md-h1')).toBeNull();
  });

  it('a nota vazia mostra o texto de ajuda', () => {
    render(<Editor inicial="" />);
    expect(superficie()).toHaveAttribute('data-placeholder', 'Escreva aqui.');
    expect(superficie().className).toContain('is-vazia');
  });

  it('o link só é link na linha sem o cursor', () => {
    render(<Editor inicial={'a\nveja [o painel](https://exemplo.test)'} />);

    expect(screen.getByRole('link', { name: 'o painel' })).toHaveAttribute(
      'href',
      'https://exemplo.test',
    );

    cursorEm(1, 0);
    expect(screen.queryByRole('link')).toBeNull();
    expect(linha(1).textContent).toBe('veja [o painel](https://exemplo.test)');
  });
});

// Os quatro que estavam quebrados na prática: seleção, Cmd+A, cópia e os
// apagares com modificador.
describe('seleção, cópia e apagar com modificador', () => {
  it('selecionar um trecho não colapsa a seleção', () => {
    render(<Editor inicial={'primeira linha\nsegunda linha'} />);

    selecionar(0, 2, 1, 5);

    const sel = window.getSelection();
    expect(sel?.isCollapsed).toBe(false);
    expect(sel?.toString()).toContain('imeira linha');
  });

  // O cursor não pode mudar de linha durante o arrasto: redesenhar a
  // superfície faria o navegador perder a seleção no meio dela.
  it('selecionar não troca a linha que mostra os sinais', () => {
    render(<Editor inicial={'# Título\ncorpo'} />);
    expect(linha(0).textContent).toBe('# Título');

    selecionar(0, 0, 1, 3);

    expect(linha(0).textContent).toBe('# Título');
    expect(window.getSelection()?.isCollapsed).toBe(false);
  });

  it('Cmd+A cobre o documento inteiro', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'# Título\ncorpo\nfim'} onChange={onChange} />);

    selecionarTudo();
    escrever('insertText', 'X');

    expect(onChange).toHaveBeenLastCalledWith('X');
  });

  it('copiar leva o texto cru, com sinais e quebras de linha', () => {
    render(<Editor inicial={'### Título\n> citação\n**forte**'} />);

    selecionarTudo();
    const dados = prancheta();
    fireEvent.copy(superficie(), { clipboardData: dados });

    expect(dados.getData('text/plain')).toBe('### Título\n> citação\n**forte**');
  });

  it('recortar copia o cru e apaga o trecho', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'# Um\n# Dois'} onChange={onChange} />);

    selecionar(0, 0, 1, 4);
    const dados = prancheta();
    fireEvent.cut(superficie(), { clipboardData: dados });

    expect(dados.getData('text/plain')).toBe('# Um\n# Dois');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  // Colar de volta o que se copiou tem de devolver a nota igual: era isto que
  // estava saindo com tudo grudado numa linha.
  it('copiar e colar devolve a mesma nota', () => {
    const original = '### Título\n> citação\n**forte**';
    const onChange = vi.fn();
    render(<Editor inicial={original} onChange={onChange} />);

    selecionarTudo();
    const dados = prancheta();
    fireEvent.copy(superficie(), { clipboardData: dados });

    selecionarTudo();
    fireEvent.paste(superficie(), { clipboardData: dados });

    expect(onChange).toHaveBeenLastCalledWith(original);
  });

  it('colar texto de fora entra como texto, com as linhas separadas', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'fim'} onChange={onChange} />);

    cursorEm(0, 0);
    const dados = prancheta();
    dados.setData('text/plain', '# Novo\n');
    fireEvent.paste(superficie(), { clipboardData: dados });

    expect(onChange).toHaveBeenLastCalledWith('# Novo\nfim');
  });

  it('Option+Backspace apaga a palavra anterior', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'uma frase aqui'} onChange={onChange} />);

    cursorEm(0, 14);
    escrever('deleteWordBackward');

    expect(onChange).toHaveBeenLastCalledWith('uma frase ');
  });

  it('Option+Backspace no começo da linha junta com a de cima', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'ab\ncd'} onChange={onChange} />);

    cursorEm(1, 0);
    escrever('deleteWordBackward');

    expect(onChange).toHaveBeenLastCalledWith('abcd');
  });

  it('Cmd+Backspace apaga até o começo da linha', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'antes\numa frase aqui'} onChange={onChange} />);

    cursorEm(1, 9);
    escrever('deleteSoftLineBackward');

    expect(onChange).toHaveBeenLastCalledWith('antes\n aqui');
  });

  it('Option+Delete apaga a palavra seguinte', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'uma frase aqui'} onChange={onChange} />);

    cursorEm(0, 3);
    escrever('deleteWordForward');

    expect(onChange).toHaveBeenLastCalledWith('uma aqui');
  });

  it('apagar com um trecho selecionado apaga o trecho', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'# Um\n# Dois'} onChange={onChange} />);

    selecionar(0, 0, 1, 4);
    escrever('deleteContentBackward');

    expect(onChange).toHaveBeenLastCalledWith('');
  });
});

// Sem estes dois, escrever uma lista é sofrimento: Tab tirava o foco do campo
// e Enter deixava a pessoa redigitar o marcador em cada item.
describe('lista e recuo', () => {
  it('Enter continua a lista', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'- primeiro'} onChange={onChange} />);

    cursorEm(0, 10);
    escrever('insertParagraph');

    expect(onChange).toHaveBeenLastCalledWith('- primeiro\n- ');
  });

  it('Enter continua a lista numerada contando adiante', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'3. terceiro'} onChange={onChange} />);

    cursorEm(0, 11);
    escrever('insertParagraph');

    expect(onChange).toHaveBeenLastCalledWith('3. terceiro\n4. ');
  });

  it('a tarefa seguinte nasce desmarcada', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'- [x] feito'} onChange={onChange} />);

    cursorEm(0, 11);
    escrever('insertParagraph');

    expect(onChange).toHaveBeenLastCalledWith('- [x] feito\n- [ ] ');
  });

  // Enter numa linha de lista vazia é como se diz "acabou a lista".
  it('Enter na lista vazia sai da lista', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'- item\n- '} onChange={onChange} />);

    cursorEm(1, 2);
    escrever('insertParagraph');

    expect(onChange).toHaveBeenLastCalledWith('- item\n');
  });

  it('Enter mantém o recuo do item aninhado', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'  - filho'} onChange={onChange} />);

    cursorEm(0, 9);
    escrever('insertParagraph');

    expect(onChange).toHaveBeenLastCalledWith('  - filho\n  - ');
  });

  it('Tab recua a linha em vez de sair do campo', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'- item'} onChange={onChange} />);

    cursorEm(0, 4);
    fireEvent.keyDown(superficie(), { key: 'Tab' });

    expect(onChange).toHaveBeenLastCalledWith('  - item');
  });

  it('Shift+Tab desfaz um nível de recuo', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'  - item'} onChange={onChange} />);

    cursorEm(0, 4);
    fireEvent.keyDown(superficie(), { key: 'Tab', shiftKey: true });

    expect(onChange).toHaveBeenLastCalledWith('- item');
  });

  it('Shift+Tab numa linha sem recuo não faz nada', () => {
    const onChange = vi.fn();
    render(<Editor inicial={'- item'} onChange={onChange} />);

    cursorEm(0, 4);
    fireEvent.keyDown(superficie(), { key: 'Tab', shiftKey: true });

    expect(onChange).not.toHaveBeenCalled();
  });
});

// A cerca é marcador como qualquer outro: aparecia crua porque eu a tratava
// como conteúdo.
describe('bloco de código cercado', () => {
  const NOTA = 'antes\n```sql\nSELECT 1\n```\ndepois';

  it('esconde as cercas quando o cursor não está nelas', () => {
    render(<Editor inicial={NOTA} />);

    expect(linha(1).textContent).toBe('');
    expect(linha(3).textContent).toBe('');
    // O conteúdo continua, literal.
    expect(linha(2).textContent).toBe('SELECT 1');
  });

  it('mostra a cerca crua quando o cursor está nela', () => {
    render(<Editor inicial={NOTA} />);

    cursorEm(1, 0);

    expect(linha(1).textContent).toBe('```sql');
    expect(linha(1).querySelector('.md-sinal')).toBeInTheDocument();
  });

  it('a linguagem vira rótulo, fora da contagem de caracteres', () => {
    render(<Editor inicial={NOTA} />);

    const cerca = linha(1).querySelector('[data-lang]');
    expect(cerca).toHaveAttribute('data-lang', 'sql');
    // Rótulo é do CSS: não pode existir como texto, senão desloca o cursor.
    expect(linha(1).textContent).toBe('');
  });

  it('as linhas do bloco formam um corpo só, com topo e base', () => {
    render(<Editor inicial={NOTA} />);

    expect(linha(0).className).not.toContain('md-bloco');
    expect(linha(1).className).toContain('is-topo');
    expect(linha(2).className).toContain('md-bloco');
    expect(linha(2).className).not.toContain('is-topo');
    expect(linha(3).className).toContain('is-base');
    expect(linha(4).className).not.toContain('md-bloco');
  });

  it('o cursor cai no fim da cerca ao clicar na faixa escondida', () => {
    const onChange = vi.fn();
    render(<Editor inicial={NOTA} onChange={onChange} />);

    cursorEm(1, 0);
    escrever('insertText', 'X');

    expect(onChange).toHaveBeenLastCalledWith('antes\n```sqlX\nSELECT 1\n```\ndepois');
  });
});
