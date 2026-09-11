import { describe, expect, it } from 'vitest';
import {
  applyEdit,
  continueList,
  formatMarkdown,
  type MarkdownAction,
} from '@/lib/markdown/editing';

/** Aplica a ação e devolve o texto com a seleção marcada por colchetes
 *  angulares — `a<b>c` é "b selecionado"; `a<>c`, o cursor entre a e c. */
function run(marked: string, action: MarkdownAction): string {
  const start = marked.indexOf('<');
  const end = marked.indexOf('>') - 1;
  const text = marked.replace('<', '').replace('>', '');
  const edit = formatMarkdown(text, { start, end }, action);
  const next = applyEdit(text, edit);
  const { start: s, end: e } = edit.selection;
  return `${next.slice(0, s)}<${next.slice(s, e)}>${next.slice(e)}`;
}

function enter(marked: string): string | null {
  const caret = marked.indexOf('|');
  const text = marked.replace('|', '');
  const edit = continueList(text, { start: caret, end: caret });
  if (!edit) return null;
  const next = applyEdit(text, edit);
  return `${next.slice(0, edit.selection.start)}|${next.slice(edit.selection.start)}`;
}

describe('formatMarkdown — marcas em volta', () => {
  it('põe negrito na seleção e mantém ela selecionada', () => {
    expect(run('um <dois> três', 'bold')).toBe('um **<dois>** três');
  });

  it('sem seleção, insere um texto de exemplo já selecionado', () => {
    expect(run('a <>b', 'bold')).toBe('a **<negrito>**b');
    expect(run('<>', 'italic')).toBe('_<itálico>_');
  });

  it('aplicar de novo desfaz', () => {
    expect(run('um **<dois>** três', 'bold')).toBe('um <dois> três');
    expect(run('~~<x>~~', 'strike')).toBe('<x>');
  });

  it('código de uma linha usa crase; de várias vira bloco', () => {
    expect(run('rode <npm test>', 'code')).toBe('rode `<npm test>`');
    expect(run('<a\nb>', 'code')).toBe('```\n<a\nb>\n```');
  });

  it('bloco de código sempre em linha própria', () => {
    expect(run('antes <x> depois', 'codeBlock')).toBe('antes \n```\n<x>\n```\n depois');
  });
});

describe('formatMarkdown — link', () => {
  it('texto selecionado vira o rótulo e o endereço fica selecionado para colar', () => {
    expect(run('veja <a doc>', 'link')).toBe('veja [a doc](<https://>)');
  });

  it('endereço selecionado vira o destino e o rótulo fica para escrever', () => {
    expect(run('<https://exemplo.com>', 'link')).toBe('[<texto>](https://exemplo.com)');
  });
});

describe('formatMarkdown — prefixos de linha', () => {
  it('lista em todas as linhas selecionadas', () => {
    expect(run('<um\ndois>', 'bullet')).toBe('<- um\n- dois>');
  });

  it('numera em sequência', () => {
    expect(run('<um\ndois\ntrês>', 'ordered')).toBe('<1. um\n2. dois\n3. três>');
  });

  it('lista de tarefas', () => {
    expect(run('com<>prar pão', 'task')).toBe('- [ ] com<>prar pão');
  });

  it('se todas as linhas já têm o prefixo, tira', () => {
    expect(run('<- um\n- dois>', 'bullet')).toBe('<um\ndois>');
    expect(run('## Tí<>tulo', 'heading')).toBe('Tí<>tulo');
    expect(run('<1. um\n2. dois>', 'ordered')).toBe('<um\ndois>');
  });

  it('tarefa não conta como item de lista simples', () => {
    expect(run('<- [ ] a>', 'bullet')).toBe('- <- [ ] a>');
  });

  it('só mexe nas linhas tocadas', () => {
    expect(run('fora\nde<>ntro\nfora', 'quote')).toBe('fora\n> de<>ntro\nfora');
  });

  it('seleção que acaba numa quebra não pega a linha de baixo', () => {
    expect(run('<um\n>dois', 'bullet')).toBe('- <um\n>dois');
  });
});

describe('continueList', () => {
  it('abre o próximo item com o mesmo marcador', () => {
    expect(enter('- um|')).toBe('- um\n- |');
    expect(enter('* um|')).toBe('* um\n* |');
  });

  it('numera o próximo item', () => {
    expect(enter('1. um\n2. dois|')).toBe('1. um\n2. dois\n3. |');
  });

  it('próxima tarefa vem desmarcada', () => {
    expect(enter('- [x] feito|')).toBe('- [x] feito\n- [ ] |');
  });

  it('preserva a indentação', () => {
    expect(enter('- a\n  - b|')).toBe('- a\n  - b\n  - |');
  });

  it('Enter num item vazio encerra a lista', () => {
    expect(enter('- um\n- |')).toBe('- um\n|');
    expect(enter('- [ ] |')).toBe('|');
  });

  it('fora de lista, deixa o Enter normal', () => {
    expect(enter('texto|')).toBeNull();
    expect(enter('-sem espaço|')).toBeNull();
  });

  it('com o cursor dentro do marcador, deixa o Enter normal', () => {
    expect(enter('-| um')).toBeNull();
  });

  it('com seleção, deixa o Enter normal', () => {
    expect(continueList('- um', { start: 2, end: 4 })).toBeNull();
  });
});
