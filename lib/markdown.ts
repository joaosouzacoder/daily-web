// Markdown suficiente para uma nota, escrito à mão.
//
// Nenhuma biblioteca: o painel de notas é o único lugar que precisa disto, e a
// lista de dependências deste projeto é curta de propósito. O resultado é uma
// árvore de objetos, não HTML: quem desenha é React, então não existe
// `dangerouslySetInnerHTML` nem caminho para injeção a partir do que a pessoa
// digitou.
//
// A árvore é *sem perda*: concatenar a fonte de todos os nós devolve o texto
// original, sinais inclusive. É isso que permite ao editor desenhar a mesma
// linha de duas formas, com os sinais à vista ou escondidos, e ainda saber a
// que caractere do texto cru corresponde cada caractere na tela.

export type WrapStyle = 'strong' | 'em' | 'strongEm' | 'strike' | 'mark';

export type Inline =
  | { kind: 'text'; text: string }
  /** `\*` e afins: a fonte é a barra mais o caractere, o visível é só ele. */
  | { kind: 'escape'; text: string }
  | { kind: 'wrap'; style: WrapStyle; marker: string; children: Inline[] }
  | { kind: 'code'; marker: string; text: string }
  | { kind: 'link'; open: string; children: Inline[]; close: string; href: string };

/** O texto cru que gerou o nó, sinais inclusive. */
export function sourceOf(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.kind) {
        case 'text':
          return n.text;
        case 'escape':
          return `\\${n.text}`;
        case 'wrap':
          return n.marker + sourceOf(n.children) + n.marker;
        case 'code':
          return n.marker + n.text + n.marker;
        case 'link':
          return n.open + sourceOf(n.children) + n.close;
      }
    })
    .join('');
}

/** O que aparece na tela quando os sinais estão escondidos. */
export function visibleOf(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.kind) {
        case 'text':
        case 'escape':
        case 'code':
          return n.text;
        case 'wrap':
        case 'link':
          return visibleOf(n.children);
      }
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Marcações dentro da linha
// ---------------------------------------------------------------------------

/** Os pares delimitadores, do mais longo para o mais curto: `***` precisa ser
 *  tentado antes de `**`, e `**` antes de `*`, senão o menor come o maior. */
const PAIRS: { open: string; style: WrapStyle }[] = [
  { open: '***', style: 'strongEm' },
  { open: '___', style: 'strongEm' },
  { open: '**', style: 'strong' },
  { open: '__', style: 'strong' },
  { open: '==', style: 'mark' },
  { open: '~~', style: 'strike' },
  { open: '*', style: 'em' },
  { open: '_', style: 'em' },
];

const LINK = /^\[([^\]]*)\]\(([^)\s]+)\)/;
const SPACE = /\s/;
const WORD = /[\p{L}\p{N}]/u;

/** Só http, https e mailto viram link. Um `javascript:` escrito na nota fica
 *  texto: o React não executaria o href, mas um link que não leva a lugar
 *  nenhum é pior do que o texto original à vista. */
function safeHref(href: string): string | null {
  const limpo = href.trim();
  if (/^https?:\/\//i.test(limpo) || /^mailto:/i.test(limpo)) return limpo;
  return null;
}

/**
 * Onde o delimitador fecha, ou -1.
 *
 * A regra é a do CommonMark: quem abre não pode ter espaço depois e quem
 * fecha não pode ter espaço antes. Sem ela, `2 * 3 * 4` viraria itálico, e
 * uma nota com multiplicação sairia deformada. O `_` ganha uma regra a mais:
 * colado a letra ou número ele não marca nada, senão
 * `tb_gamification_rewards` viraria itálico no meio.
 */
function findCloser(text: string, open: number, marker: string): number {
  const depois = text[open + marker.length];
  if (depois === undefined || SPACE.test(depois)) return -1;

  const sublinhado = marker[0] === '_';
  if (sublinhado) {
    const antes = text[open - 1];
    if (antes !== undefined && WORD.test(antes)) return -1;
  }

  for (let i = open + marker.length; i <= text.length - marker.length; i += 1) {
    if (!text.startsWith(marker, i)) continue;
    if (SPACE.test(text[i - 1])) continue;
    if (sublinhado) {
      const seguinte = text[i + marker.length];
      if (seguinte !== undefined && WORD.test(seguinte)) continue;
    }
    return i;
  }
  return -1;
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buffer = '';
  let i = 0;

  const flush = () => {
    if (buffer) {
      out.push({ kind: 'text', text: buffer });
      buffer = '';
    }
  };

  while (i < text.length) {
    const rest = text.slice(i);

    if (text[i] === '\\' && i + 1 < text.length) {
      flush();
      out.push({ kind: 'escape', text: text[i + 1] });
      i += 2;
      continue;
    }

    if (text[i] === '`') {
      const fim = text.indexOf('`', i + 1);
      if (fim > i + 1) {
        flush();
        out.push({ kind: 'code', marker: '`', text: text.slice(i + 1, fim) });
        i = fim + 1;
        continue;
      }
    }

    const link = rest.match(LINK);
    if (link) {
      const href = safeHref(link[2]);
      if (href) {
        flush();
        out.push({
          kind: 'link',
          open: '[',
          children: parseInline(link[1]),
          close: `](${link[2]})`,
          href,
        });
        i += link[0].length;
        continue;
      }
    }

    const par = PAIRS.find((p) => rest.startsWith(p.open));
    if (par) {
      const fim = findCloser(text, i, par.open);
      // Delimitador sem par, ou vazio (`**` colado), fica texto: é o estado
      // normal de quem acabou de digitar o primeiro dos dois.
      if (fim > i + par.open.length) {
        flush();
        out.push({
          kind: 'wrap',
          style: par.style,
          marker: par.open,
          children: parseInline(text.slice(i + par.open.length, fim)),
        });
        i = fim + par.open.length;
        continue;
      }
    }

    buffer += text[i];
    i += 1;
  }

  flush();
  return out;
}

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------

export type LineKind =
  | 'heading'
  | 'quote'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'rule'
  | 'fence'
  | 'code'
  | 'paragraph';

/**
 * O que uma linha é, sozinha. O editor é uma superfície contínua e desenha
 * linha por linha, então a unidade de leitura aqui é a linha, não o bloco:
 * uma citação de três linhas são três linhas de citação, cada uma com a sua
 * barra à esquerda, que é como o Obsidian a desenha.
 */
export interface LineInfo {
  kind: LineKind;
  /** Nível do título (1 a 6). Zero fora de título. */
  level: number;
  /** Recuo em níveis, para lista aninhada. */
  depth: number;
  /** O prefixo cru da linha, espaços inclusive. Vazio num parágrafo. */
  marker: string;
  /** O que vem depois do prefixo. */
  content: string;
  /** Só em `task`. */
  checked: boolean;
  /** Só na cerca de abertura: a linguagem escrita depois dos crases. */
  lang: string;
}

const HEADING = /^(#{1,6}\s+)(.*)$/;
const RULE = /^(\s{0,3}([-*_])(?:\s*\2){2,}\s*)$/;
const QUOTE = /^(\s{0,3}>\s?)(.*)$/;
const BULLET = /^(\s*)([-*+]\s+)(.*)$/;
const ORDERED = /^(\s*)(\d{1,9}[.)]\s+)(.*)$/;
const TASK = /^(\[[ xX]\]\s+)(.*)$/;
const FENCE = /^\s*(```|~~~)/;

/** Quanto de recuo separa um nível do outro. Dois espaços é o que o Obsidian
 *  insere ao apertar Tab numa lista. */
const INDENT_STEP = 2;

const plain = (content: string, kind: LineKind = 'paragraph'): LineInfo => ({
  kind,
  level: 0,
  depth: 0,
  marker: '',
  content,
  checked: false,
  lang: '',
});

/** A cerca inteira é marcador, como o `#` de um título: some quando o cursor
 *  não está nela e volta quando está. A linguagem escrita ao lado vira um
 *  rótulo, desenhado pelo CSS. */
function fenceInfo(line: string, marca: string): LineInfo {
  return {
    ...plain(''),
    kind: 'fence',
    marker: line,
    lang: line.trimStart().slice(marca.length).trim(),
  };
}

export function lineInfo(line: string, inCode = false): LineInfo {
  // Dentro de um bloco cercado nada é marcação: o texto é o conteúdo. A
  // exceção é a própria cerca.
  if (inCode) {
    const cerca = line.match(FENCE);
    return cerca ? fenceInfo(line, cerca[1]) : plain(line, 'code');
  }

  const rule = line.match(RULE);
  if (rule) return { ...plain(''), kind: 'rule', marker: rule[1] };

  const heading = line.match(HEADING);
  if (heading) {
    return {
      ...plain(heading[2]),
      kind: 'heading',
      level: heading[1].trimEnd().length,
      marker: heading[1],
    };
  }

  const quote = line.match(QUOTE);
  if (quote) return { ...plain(quote[2]), kind: 'quote', marker: quote[1] };

  const bullet = line.match(BULLET) ?? line.match(ORDERED);
  if (bullet) {
    const ordered = BULLET.test(line) ? false : true;
    const depth = Math.floor(bullet[1].length / INDENT_STEP);
    const task = bullet[3].match(TASK);
    if (task) {
      return {
        ...plain(task[2]),
        kind: 'task',
        depth,
        marker: bullet[1] + bullet[2] + task[1],
        checked: task[1].toLowerCase().includes('x'),
      };
    }
    return {
      ...plain(bullet[3]),
      kind: ordered ? 'ordered' : 'bullet',
      depth,
      marker: bullet[1] + bullet[2],
    };
  }

  const cerca = line.match(FENCE);
  if (cerca) return fenceInfo(line, cerca[1]);

  return plain(line);
}

/**
 * Quais linhas estão dentro de um bloco de código cercado, as próprias cercas
 * inclusive. É a única informação que uma linha não tem sozinha, e sem ela um
 * `# comentário` dentro do bloco viraria título.
 */
export function codeLines(lines: string[]): boolean[] {
  const out: boolean[] = [];
  let dentro = false;
  let cerca = '';

  for (const line of lines) {
    const abre = line.match(FENCE);
    if (!dentro && abre) {
      dentro = true;
      cerca = abre[1];
      out.push(true);
      continue;
    }
    if (dentro && abre && line.trimStart().startsWith(cerca)) {
      dentro = false;
      cerca = '';
      out.push(true);
      continue;
    }
    out.push(dentro);
  }
  return out;
}

/**
 * Para cada caractere que aparece na tela com os sinais escondidos, o índice
 * dele no texto cru da linha.
 *
 * É o dicionário que o editor usa quando o cursor entra numa linha que estava
 * formatada: a posição que o navegador informa está em coordenadas do que
 * está desenhado, e revelar os sinais muda o texto sob o cursor. Sem esta
 * tradução o cursor saltaria alguns caracteres a cada mudança de linha.
 */
export function visibleMap(line: string, inCode = false): number[] {
  const info = lineInfo(line, inCode);
  // Divisória e cerca são marcador puro: com os sinais escondidos não sobra
  // caractere nenhum na tela.
  if (info.kind === 'rule' || info.kind === 'fence') return [];
  if (info.kind === 'code') return Array.from({ length: line.length }, (_, i) => i);

  const map: number[] = [];
  let cursor = info.marker.length;


  const walk = (nodes: Inline[]) => {
    for (const node of nodes) {
      switch (node.kind) {
        case 'text':
          for (let i = 0; i < node.text.length; i += 1) map.push(cursor + i);
          cursor += node.text.length;
          break;
        case 'escape':
          // A barra não aparece; o caractere seguinte, sim.
          cursor += 1;
          map.push(cursor);
          cursor += 1;
          break;
        case 'code':
          cursor += node.marker.length;
          for (let i = 0; i < node.text.length; i += 1) map.push(cursor + i);
          cursor += node.text.length + node.marker.length;
          break;
        case 'wrap':
          cursor += node.marker.length;
          walk(node.children);
          cursor += node.marker.length;
          break;
        case 'link':
          cursor += node.open.length;
          walk(node.children);
          cursor += node.close.length;
          break;
      }
    }
  };

  walk(parseInline(info.content));
  return map;
}

/** A posição no texto cru que corresponde a uma posição no texto desenhado. */
export function sourceOffset(line: string, visible: number, inCode = false): number {
  const map = visibleMap(line, inCode);
  if (visible <= 0) return map[0] ?? line.length;
  if (visible >= map.length) return line.length;
  return map[visible];
}

// ---------------------------------------------------------------------------
// Coordenadas do documento
// ---------------------------------------------------------------------------

/** Posição absoluta no texto, a partir da linha e do deslocamento nela. */
export function toAbsolute(lines: string[], line: number, offset: number): number {
  let total = 0;
  for (let i = 0; i < line && i < lines.length; i += 1) total += lines[i].length + 1;
  return total + offset;
}

/** O contrário: de posição absoluta para linha e deslocamento. */
export function toLineOffset(lines: string[], absolute: number): { line: number; offset: number } {
  let restante = Math.max(0, absolute);
  for (let i = 0; i < lines.length; i += 1) {
    if (restante <= lines[i].length) return { line: i, offset: restante };
    restante -= lines[i].length + 1;
  }
  const last = Math.max(0, lines.length - 1);
  return { line: last, offset: lines[last]?.length ?? 0 };
}
