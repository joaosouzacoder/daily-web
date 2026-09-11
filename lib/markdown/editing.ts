// Formatação Markdown do editor de notas. Tudo aqui é função pura sobre o
// texto e a seleção: devolve a menor troca que produz o resultado — o trecho
// substituído e onde a seleção fica depois. A tela aplica a troca pelo
// próprio campo de texto, o que preserva o desfazer do navegador.

export interface Selection {
  start: number;
  end: number;
}

export interface TextEdit {
  /** Trecho do texto original que sai. */
  from: number;
  to: number;
  /** O que entra no lugar. */
  insert: string;
  /** A seleção depois da troca, em posições do texto novo. */
  selection: Selection;
}

export type MarkdownAction =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'link'
  | 'heading'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'quote'
  | 'codeBlock';

export function applyEdit(text: string, edit: TextEdit): string {
  return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
}

const PLACEHOLDER: Partial<Record<MarkdownAction, string>> = {
  bold: 'negrito',
  italic: 'itálico',
  strike: 'riscado',
  code: 'código',
};

/** Marca em volta da seleção. Se a seleção já está marcada, desmarca: clicar
 *  duas vezes em negrito volta ao texto de antes. */
function wrap(text: string, sel: Selection, marker: string, placeholder: string): TextEdit {
  const m = marker.length;
  const before = text.slice(Math.max(0, sel.start - m), sel.start);
  const after = text.slice(sel.end, sel.end + m);

  if (before === marker && after === marker) {
    const inner = text.slice(sel.start, sel.end);
    return {
      from: sel.start - m,
      to: sel.end + m,
      insert: inner,
      selection: { start: sel.start - m, end: sel.end - m },
    };
  }

  const inner = text.slice(sel.start, sel.end) || placeholder;
  return {
    from: sel.start,
    to: sel.end,
    insert: `${marker}${inner}${marker}`,
    selection: { start: sel.start + m, end: sel.start + m + inner.length },
  };
}

function link(text: string, sel: Selection): TextEdit {
  const selected = text.slice(sel.start, sel.end);
  // Selecionou um endereço: ele vira o destino e o texto fica para escrever.
  if (/^https?:\/\/\S+$/i.test(selected)) {
    const label = 'texto';
    return {
      from: sel.start,
      to: sel.end,
      insert: `[${label}](${selected})`,
      selection: { start: sel.start + 1, end: sel.start + 1 + label.length },
    };
  }
  const label = selected || 'texto';
  const url = 'https://';
  const urlStart = sel.start + label.length + 3;
  return {
    from: sel.start,
    to: sel.end,
    insert: `[${label}](${url})`,
    selection: { start: urlStart, end: urlStart + url.length },
  };
}

function lineBounds(text: string, sel: Selection): Selection {
  const start = text.lastIndexOf('\n', sel.start - 1) + 1;
  // Uma seleção que termina logo depois de uma quebra não inclui a linha de
  // baixo — é o que acontece ao selecionar linhas inteiras com o mouse.
  const endAt = sel.end > sel.start && text[sel.end - 1] === '\n' ? sel.end - 1 : sel.end;
  const newline = text.indexOf('\n', endAt);
  return { start, end: newline === -1 ? text.length : newline };
}

const LINE_PREFIX: Record<'heading' | 'bullet' | 'task' | 'quote', { add: string; has: RegExp }> = {
  heading: { add: '## ', has: /^#{1,6}\s/ },
  bullet: { add: '- ', has: /^[-*+]\s(?!\[[ xX]\])/ },
  task: { add: '- [ ] ', has: /^[-*+]\s\[[ xX]\]\s/ },
  quote: { add: '> ', has: /^>\s?/ },
};
const ORDERED = /^\d+[.)]\s/;

/** Prefixo em cada linha tocada pela seleção. Se todas já têm, tira. */
function prefixLines(
  text: string,
  sel: Selection,
  action: 'heading' | 'bullet' | 'task' | 'quote' | 'ordered',
): TextEdit {
  const bounds = lineBounds(text, sel);
  const lines = text.slice(bounds.start, bounds.end).split('\n');
  const has = action === 'ordered' ? ORDERED : LINE_PREFIX[action].has;
  const filled = lines.filter((line) => line.trim() !== '');
  const remove = filled.length > 0 && filled.every((line) => has.test(line));

  let counter = 0;
  const next = lines.map((line) => {
    if (remove) return line.replace(has, '');
    if (line.trim() === '' && lines.length > 1) return line;
    counter += 1;
    return (action === 'ordered' ? `${counter}. ` : LINE_PREFIX[action].add) + line;
  });
  const insert = next.join('\n');

  // Uma linha só: o cursor acompanha o texto, em vez de pular para o começo.
  if (lines.length === 1) {
    const shift = insert.length - lines[0].length;
    const clamp = (pos: number) => Math.max(bounds.start, pos + shift);
    return { from: bounds.start, to: bounds.end, insert, selection: { start: clamp(sel.start), end: clamp(sel.end) } };
  }
  return {
    from: bounds.start,
    to: bounds.end,
    insert,
    selection: { start: bounds.start, end: bounds.start + insert.length },
  };
}

function codeBlock(text: string, sel: Selection): TextEdit {
  const inner = text.slice(sel.start, sel.end) || 'código';
  // O bloco precisa começar e terminar numa linha própria.
  const lead = sel.start > 0 && text[sel.start - 1] !== '\n' ? '\n' : '';
  const tail = sel.end < text.length && text[sel.end] !== '\n' ? '\n' : '';
  const open = `${lead}\`\`\`\n`;
  return {
    from: sel.start,
    to: sel.end,
    insert: `${open}${inner}\n\`\`\`${tail}`,
    selection: { start: sel.start + open.length, end: sel.start + open.length + inner.length },
  };
}

export function formatMarkdown(text: string, sel: Selection, action: MarkdownAction): TextEdit {
  switch (action) {
    case 'bold':
      return wrap(text, sel, '**', PLACEHOLDER.bold!);
    case 'italic':
      return wrap(text, sel, '_', PLACEHOLDER.italic!);
    case 'strike':
      return wrap(text, sel, '~~', PLACEHOLDER.strike!);
    case 'code':
      // Código em várias linhas não cabe entre crases: vira bloco.
      return text.slice(sel.start, sel.end).includes('\n')
        ? codeBlock(text, sel)
        : wrap(text, sel, '`', PLACEHOLDER.code!);
    case 'link':
      return link(text, sel);
    case 'codeBlock':
      return codeBlock(text, sel);
    case 'heading':
    case 'bullet':
    case 'task':
    case 'quote':
    case 'ordered':
      return prefixLines(text, sel, action);
  }
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/;

/**
 * O Enter dentro de uma lista: abre o próximo item com o mesmo marcador — o
 * número seguinte, e caixa desmarcada numa lista de tarefas. Enter num item
 * vazio encerra a lista. Fora de lista, devolve null e o Enter é o normal.
 */
export function continueList(text: string, sel: Selection): TextEdit | null {
  if (sel.start !== sel.end) return null;
  const lineStart = text.lastIndexOf('\n', sel.start - 1) + 1;
  const newline = text.indexOf('\n', sel.start);
  const lineEnd = newline === -1 ? text.length : newline;
  const line = text.slice(lineStart, lineEnd);
  const match = LIST_ITEM.exec(line);
  if (!match) return null;

  const [, indent, marker, space, task, content] = match;
  const prefixLength = line.length - content.length;
  // Cursor no meio do marcador: não é continuação de item, é edição dele.
  if (sel.start - lineStart < prefixLength) return null;

  if (content.trim() === '') {
    return { from: lineStart, to: lineEnd, insert: '', selection: { start: lineStart, end: lineStart } };
  }

  const ordered = /^(\d+)([.)])$/.exec(marker);
  const nextMarker = ordered ? `${Number(ordered[1]) + 1}${ordered[2]}` : marker;
  const insert = `\n${indent}${nextMarker}${space}${task ? '[ ] ' : ''}`;
  const caret = sel.start + insert.length;
  return { from: sel.start, to: sel.start, insert, selection: { start: caret, end: caret } };
}
