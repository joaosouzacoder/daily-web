// Limpeza de corpo de e-mail e ordenação de pastas. Nasceu junto do parser da
// CLI himalaya; sobreviveu à troca por IMAP direto porque o problema é o
// mesmo: transformar HTML de newsletter em texto legível.

export function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)));
}

function collapseBlankLines(raw: string): string {
  return raw
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeHtml(raw: string): boolean {
  return /<\s*(html|body|table|div|p|br)\b/i.test(raw);
}

const BLOCK_TAGS_RE = /<\/?(p|br|div|tr|td|th|li|h[1-6]|table|ul|ol)\b[^>]*>/gi;

function stripHiddenElements(html: string): string {
  const openTagWithDisplayNone = /<([a-z][a-z0-9]*)\b[^>]*\bstyle\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>/gi;
  let result = html;
  let match: RegExpExecArray | null;
  while ((match = openTagWithDisplayNone.exec(result))) {
    const tagName = match[1].toLowerCase();
    const startIndex = match.index;
    const openRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
    const closeRe = new RegExp(`</${tagName}>`, 'gi');
    let depth = 1;
    let cursor = openTagWithDisplayNone.lastIndex;
    let endIndex = result.length;
    while (depth > 0) {
      openRe.lastIndex = cursor;
      closeRe.lastIndex = cursor;
      const nextOpen = openRe.exec(result);
      const nextClose = closeRe.exec(result);
      if (!nextClose) {
        endIndex = result.length;
        break;
      }
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth += 1;
        cursor = nextOpen.index + nextOpen[0].length;
      } else {
        depth -= 1;
        cursor = nextClose.index + nextClose[0].length;
        if (depth === 0) endIndex = cursor;
      }
    }
    result = result.slice(0, startIndex) + result.slice(endIndex);
    openTagWithDisplayNone.lastIndex = 0;
  }
  return result;
}

export function readable(raw: string): string {
  if (!looksLikeHtml(raw)) {
    return collapseBlankLines(raw);
  }
  const withoutScripts = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const withoutHidden = stripHiddenElements(withoutScripts);
  const withBreaks = withoutHidden.replace(BLOCK_TAGS_RE, '\n');
  const withoutTags = withBreaks.replace(/<[^>]+>/g, '');
  return collapseBlankLines(decodeEntities(withoutTags));
}

/**
 * A linha de atribuição que abre o trecho citado. Cada cliente escreve a sua
 * ("Em qui., 27 de ago. de 2026 às 12:11, <x> escreveu:", "On Thu, Aug 27,
 * 2026 at 12:11 <x> wrote:"), e o que elas têm em comum é terminar com
 * escreveu/wrote/escribió seguido de dois-pontos.
 */
const ATTRIBUTION_RE = /^\s*(?:em|on|el|le|am)\b[\s\S]{0,300}?\b(?:escreveu|wrote|escribió|a écrit|schrieb)\s*:\s*$/i;

/** O separador que Outlook e afins colocam no lugar da atribuição. */
const SEPARATOR_RE =
  /^\s*(?:-{2,}\s*(?:mensagem original|original message|forwarded message|mensagem encaminhada)\s*-{2,}|_{5,}|-{5,})\s*$/i;

export interface SplitBody {
  /** O que a pessoa escreveu agora. */
  text: string;
  /** O histórico citado abaixo, vazio quando não há. */
  quoted: string;
}

/**
 * Separa a resposta do histórico citado. O corte acontece na primeira linha de
 * atribuição ou separador, ou no começo de um bloco de citação (`>`) que vai
 * até o fim — antes disso um `>` solto pode ser só alguém citando uma frase no
 * meio do texto, e cortar ali comeria o que a pessoa escreveu.
 */
export function splitQuoted(body: string): SplitBody {
  const linhas = body.split('\n');

  for (let i = 0; i < linhas.length; i += 1) {
    // A atribuição costuma vir quebrada pelo cliente ("...às 12:11, <x>\n
    // escreveu:"), então a janela cresce até três linhas antes de desistir.
    const atribuicao = [1, 2, 3].some((tamanho) =>
      ATTRIBUTION_RE.test(linhas.slice(i, i + tamanho).join(' ')),
    );
    if (!atribuicao && !SEPARATOR_RE.test(linhas[i])) continue;
    return {
      text: linhas.slice(0, i).join('\n').trimEnd(),
      quoted: linhas.slice(i).join('\n').trim(),
    };
  }

  // Sem atribuição: procura o começo do bloco citado que fecha a mensagem.
  let inicio = -1;
  for (let i = linhas.length - 1; i >= 0; i -= 1) {
    const linha = linhas[i].trim();
    if (linha.startsWith('>')) inicio = i;
    else if (linha !== '') break;
  }
  if (inicio === -1) return { text: body.trimEnd(), quoted: '' };

  return {
    text: linhas.slice(0, inicio).join('\n').trimEnd(),
    quoted: linhas.slice(inicio).join('\n').trim(),
  };
}

const FOLDER_ALIASES = ['inbox', 'sent', 'drafts', 'trash', 'spam', 'all'];

export function sortFolders(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const rankA = FOLDER_ALIASES.indexOf(a.toLowerCase());
    const rankB = FOLDER_ALIASES.indexOf(b.toLowerCase());
    const ra = rankA === -1 ? FOLDER_ALIASES.length : rankA;
    const rb = rankB === -1 ? FOLDER_ALIASES.length : rankB;
    if (ra !== rb) return ra - rb;
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
}
