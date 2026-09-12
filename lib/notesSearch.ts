import { folderPath } from './notesTree';
import type { Note, NoteFolder } from './types';

/** Quantos caracteres do texto acompanham o trecho encontrado, de cada lado. */
const SNIPPET_CONTEXT = 40;
/** Teto de resultados. A busca corre sobre o texto inteiro de cada nota; sem
 *  teto, uma consulta de uma letra desenha a lista toda em trechos. */
export const MAX_SEARCH_RESULTS = 50;

/**
 * A forma comparável de um texto: sem acento e em minúsculas, para "sessão"
 * achar "SESSAO". Caractere a caractere de propósito — o trecho mostrado é
 * recortado do texto original pela posição achada aqui, e uma normalização
 * que encurtasse a string deslocaria esse recorte.
 */
export function normalize(text: string): string {
  let out = '';
  for (const char of text) {
    const stripped = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    out += (stripped || char).toLowerCase();
  }
  return out;
}

export interface NoteSearchResult {
  note: Note;
  /** Em qual campo bateu. O título ganha do texto quando bate nos dois. */
  field: 'title' | 'body';
  /** Um pedaço do texto em volta do que bateu, com reticências nas pontas. */
  snippet: string;
  /** O caminho de pastas até a nota, da raiz para dentro. Vazio: sem pasta. */
  path: string[];
}

export interface SearchOptions {
  /** Restringe à pasta e às subpastas dela; `null` na lista é "Sem pasta".
   *  A opção ausente busca em tudo. */
  scopeIds?: (string | null)[] | null;
}

/** O trecho em volta do primeiro acerto, cortado nos limites do texto. */
function snippetAround(body: string, index: number, length: number): string {
  const start = Math.max(0, index - SNIPPET_CONTEXT);
  const end = Math.min(body.length, index + length + SNIPPET_CONTEXT);
  const core = body.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${core}${end < body.length ? '…' : ''}`;
}

/**
 * As notas cujo título ou texto contém a consulta, sem distinguir acento nem
 * caixa. Função pura: recebe a lista que a tela já tem e devolve o que
 * mostrar — título, trecho e caminho da pasta.
 */
export function searchNotes(
  notes: Note[],
  folders: NoteFolder[],
  query: string,
  options: SearchOptions = {},
): NoteSearchResult[] {
  const needle = normalize(query.trim());
  if (!needle) return [];

  const scope = options.scopeIds ?? null;
  const results: NoteSearchResult[] = [];

  for (const note of notes) {
    if (scope && !scope.includes(note.folderId)) continue;

    const title = normalize(note.title);
    const body = normalize(note.body);
    const inTitle = title.includes(needle);
    const at = body.indexOf(needle);
    if (!inTitle && at === -1) continue;

    results.push({
      note,
      field: inTitle ? 'title' : 'body',
      // Mesmo quando bateu no título, o trecho vem do texto quando há um: é
      // ele que diz de qual nota se trata quando os títulos se parecem.
      snippet:
        at !== -1
          ? snippetAround(note.body, at, needle.length)
          : note.body.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_CONTEXT * 2),
      path: folderPath(folders, note.folderId),
    });
  }

  // O acerto no título vem antes: quem busca por nome espera a nota, não a
  // menção dela no texto de outra. O corte vem depois da ordenação, senão o
  // teto poderia descartar justamente o acerto no título.
  return results
    .sort((a, b) => (a.field === b.field ? 0 : a.field === 'title' ? -1 : 1))
    .slice(0, MAX_SEARCH_RESULTS);
}
