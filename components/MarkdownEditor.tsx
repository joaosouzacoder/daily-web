'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  codeLines,
  lineInfo,
  sourceOffset,
  toAbsolute,
  toLineOffset,
} from '@/lib/markdown';
import type { LineInfo } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import { MarkdownLine } from './MarkdownLine';

interface Props {
  value: string;
  onChange: (text: string) => void;
  /** Nome acessível do campo, o mesmo que o textarea cru usa. */
  label: string;
  placeholder?: string;
}

interface Caret {
  line: number;
  offset: number;
}

const PALAVRA = /[\p{L}\p{N}_]/u;

/** Onde começa a palavra à esquerda do cursor. Pula primeiro os separadores,
 *  como faz o Option+Backspace do sistema. */
function inicioDaPalavra(texto: string, offset: number): number {
  let i = offset;
  while (i > 0 && !PALAVRA.test(texto[i - 1])) i -= 1;
  while (i > 0 && PALAVRA.test(texto[i - 1])) i -= 1;
  return i;
}

/** O espelho, para a direita. */
function fimDaPalavra(texto: string, offset: number): number {
  let i = offset;
  while (i < texto.length && !PALAVRA.test(texto[i])) i += 1;
  while (i < texto.length && PALAVRA.test(texto[i])) i += 1;
  return i;
}

/** O marcador da próxima linha da lista. Uma tarefa nasce desmarcada, e uma
 *  lista numerada segue a contagem. */
function proximoMarcador(info: LineInfo): string {
  const recuo = ' '.repeat(info.depth * 2);
  if (info.kind === 'task') return `${recuo}- [ ] `;
  if (info.kind === 'ordered') {
    const numero = Number(info.marker.trim().replace(/[.)]$/, ''));
    const pontuacao = info.marker.trim().endsWith(')') ? ')' : '.';
    return `${recuo}${Number.isFinite(numero) ? numero + 1 : 1}${pontuacao} `;
  }
  return `${recuo}${info.marker.trim()} `;
}

/** Dois espaços por nível: é o recuo que o Obsidian insere com Tab. */
const RECUO = '  ';

/** Quanto tempo de digitação parada fecha um passo do desfazer. */
const UNDO_MS = 500;
const UNDO_MAX = 100;

/**
 * Escrever vendo o resultado, como no Obsidian.
 *
 * A nota é **uma** superfície de edição, não uma pilha de campos. O cursor
 * anda por ela livremente, com as setas e com o clique, e a linha em que ele
 * está revela os seus sinais sem perder a formatação: o título continua
 * grande, o negrito continua negrito, e o `#` aparece ao lado, apagado. Sair
 * da linha esconde os sinais de novo.
 *
 * Por que `contentEditable` e não um campo por linha: é o que dá navegação
 * contínua de graça. Seta para baixo atravessa a linha formatada, o clique cai
 * onde se clicou, seleção passa de uma linha para a outra, Home e End
 * funcionam. Reproduzir isso com campos separados dá o comportamento do
 * Notion, que é justamente o que não se quer aqui.
 *
 * A edição é toda controlada: cada `beforeinput` é interceptado, aplicado ao
 * texto e devolvido pelo `onChange`, e o cursor é recolocado depois do
 * desenho. O navegador nunca escreve na árvore por conta própria, então o
 * React pode ser o dono do DOM sem disputar com ele. O preço é que o desfazer
 * do navegador não vale, e por isso existe uma pilha própria aqui.
 */
export function MarkdownEditor({ value, onChange, label, placeholder }: Props) {
  const linhas = value.split('\n');
  const emCodigo = codeLines(linhas);

  const [ativa, setAtiva] = useState(0);
  const superficie = useRef<HTMLDivElement | null>(null);
  /** Onde recolocar o cursor depois do próximo desenho. */
  const paraColocar = useRef<Caret | null>(null);
  /** Qual linha estava com os sinais à vista no desenho que está na tela. */
  const desenhadaComSinais = useRef(0);
  const compondo = useRef(false);

  const desfazer = useRef<{ texto: string; caret: Caret }[]>([]);
  const refazer = useRef<{ texto: string; caret: Caret }[]>([]);
  const ultimoPasso = useRef(0);

  // ------------------------------------------------------------------
  // Leitura e escrita do cursor
  // ------------------------------------------------------------------

  /** Em que linha e em que caractere do texto cru está um ponto do DOM. */
  const lerPonto = useCallback(
    (node: Node, offset: number): Caret | null => {
      const raiz = superficie.current;
      if (!raiz) return null;

      // Selecionar tudo ancora na própria superfície, e o deslocamento ali
      // conta linhas, não letras. Sem este caso, Cmd+A não encontrava linha
      // nenhuma e nada do que viesse depois funcionava.
      if (node === raiz) {
        const ultima = Math.max(0, linhas.length - 1);
        if (offset >= raiz.childNodes.length) {
          return { line: ultima, offset: linhas[ultima]?.length ?? 0 };
        }
        return { line: Math.min(offset, ultima), offset: 0 };
      }

      const elemento = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
      const divLinha = elemento?.closest('[data-linha]');
      if (!divLinha || !raiz.contains(divLinha)) return null;
      const linha = Number(divLinha.getAttribute('data-linha'));

      // Quantos caracteres existem dentro da linha antes deste ponto.
      let contados = 0;
      const walker = document.createTreeWalker(divLinha, NodeFilter.SHOW_TEXT);
      let atual = walker.nextNode();
      while (atual) {
        if (atual === node) {
          contados += offset;
          atual = null;
          break;
        }
        contados += atual.textContent?.length ?? 0;
        atual = walker.nextNode();
      }
      // Ponto ancorado no próprio elemento: `offset` conta filhos, não letras.
      if (node.nodeType !== Node.TEXT_NODE) {
        contados = offset === 0 ? 0 : (divLinha.textContent?.length ?? 0);
      }

      // Na linha que está com os sinais à vista, o que se conta na tela é o
      // texto cru. Nas outras é preciso traduzir.
      const cru =
        linha === desenhadaComSinais.current
          ? Math.min(contados, linhas[linha]?.length ?? 0)
          : sourceOffset(linhas[linha] ?? '', contados, emCodigo[linha] ?? false);

      return { line: linha, offset: cru };
    },
    [linhas, emCodigo],
  );

  const lerSelecao = useCallback((): { inicio: Caret; fim: Caret } | null => {
    const sel = typeof window === 'undefined' ? null : window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !sel.focusNode) return null;

    const a = lerPonto(sel.anchorNode, sel.anchorOffset);
    const b = lerPonto(sel.focusNode, sel.focusOffset);
    if (!a || !b) return null;

    const antes =
      a.line < b.line || (a.line === b.line && a.offset <= b.offset) ? [a, b] : [b, a];
    return { inicio: antes[0], fim: antes[1] };
  }, [lerPonto]);

  /** Coloca o cursor num caractere do texto cru. A linha alvo já está
   *  desenhada com os sinais, então o que se conta na tela é o texto cru. */
  const colocar = useCallback((caret: Caret) => {
    const raiz = superficie.current;
    if (!raiz) return;
    const divLinha = raiz.querySelector(`[data-linha="${caret.line}"]`);
    if (!divLinha) return;

    let restante = caret.offset;
    const walker = document.createTreeWalker(divLinha, NodeFilter.SHOW_TEXT);
    let no = walker.nextNode();
    let alvo: { node: Node; offset: number } | null = null;

    while (no) {
      const tamanho = no.textContent?.length ?? 0;
      if (restante <= tamanho) {
        alvo = { node: no, offset: restante };
        break;
      }
      restante -= tamanho;
      no = walker.nextNode();
    }

    const range = document.createRange();
    if (alvo) range.setStart(alvo.node, alvo.offset);
    else range.setStart(divLinha, 0);
    range.collapse(true);

    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  useLayoutEffect(() => {
    desenhadaComSinais.current = ativa;
    const pendente = paraColocar.current;
    paraColocar.current = null;
    if (pendente) colocar(pendente);
  }, [ativa, value, colocar]);

  // ------------------------------------------------------------------
  // Edição
  // ------------------------------------------------------------------

  const guardar = useCallback(
    (caret: Caret, agrupar: boolean) => {
      const agora = Date.now();
      const juntar = agrupar && agora - ultimoPasso.current < UNDO_MS;
      ultimoPasso.current = agora;
      if (juntar && desfazer.current.length > 0) return;
      desfazer.current.push({ texto: value, caret });
      if (desfazer.current.length > UNDO_MAX) desfazer.current.shift();
      refazer.current = [];
    },
    [value],
  );

  /** Troca um intervalo do texto e leva o cursor para o fim do que entrou. */
  const aplicar = useCallback(
    (inicio: Caret, fim: Caret, texto: string, agrupar = false) => {
      const de = toAbsolute(linhas, inicio.line, inicio.offset);
      const ate = toAbsolute(linhas, fim.line, fim.offset);
      guardar(inicio, agrupar);

      const novo = value.slice(0, de) + texto + value.slice(ate);
      const caret = toLineOffset(novo.split('\n'), de + texto.length);
      paraColocar.current = caret;
      setAtiva(caret.line);
      onChange(novo);
    },
    [linhas, value, onChange, guardar],
  );

  const voltar = useCallback(
    (pilha: typeof desfazer, outra: typeof refazer) => {
      const passo = pilha.current.pop();
      if (!passo) return;
      outra.current.push({ texto: value, caret: { line: ativa, offset: 0 } });
      paraColocar.current = passo.caret;
      setAtiva(passo.caret.line);
      ultimoPasso.current = 0;
      onChange(passo.texto);
    },
    [value, ativa, onChange],
  );

  // `beforeinput` é ouvido no elemento, não pelo React: é ali que dá para
  // recusar a escrita do navegador antes de ela acontecer.
  useEffect(() => {
    const raiz = superficie.current;
    if (!raiz) return;

    const aoEscrever = (evento: Event) => {
      const e = evento as InputEvent;
      // Durante a composição do teclado (acento, IME) o navegador precisa
      // escrever sozinho: recusar aqui deixaria a composição sem efeito.
      if (compondo.current) return;

      const sel = lerSelecao();
      if (!sel) return;
      const { inicio, fim } = sel;

      switch (e.inputType) {
        case 'insertText':
        case 'insertReplacementText':
          e.preventDefault();
          aplicar(inicio, fim, e.data ?? '', true);
          return;

        case 'insertParagraph':
        case 'insertLineBreak': {
          e.preventDefault();
          const info = lineInfo(linhas[inicio.line] ?? '', emCodigo[inicio.line] ?? false);
          const emLista =
            info.kind === 'bullet' || info.kind === 'ordered' || info.kind === 'task';
          const noFim = inicio.offset >= (linhas[inicio.line]?.length ?? 0);

          // Enter numa lista continua a lista, como em qualquer editor de
          // Markdown. Numa linha de lista sem conteúdo, sai dela: é assim que
          // se diz "acabou", sem ter de apagar o marcador à mão.
          if (emLista && inicio.line === fim.line) {
            if (info.content === '') {
              aplicar(
                { line: inicio.line, offset: 0 },
                { line: inicio.line, offset: linhas[inicio.line].length },
                '',
              );
              return;
            }
            if (noFim) {
              aplicar(inicio, fim, `\n${proximoMarcador(info)}`);
              return;
            }
          }
          aplicar(inicio, fim, '\n');
          return;
        }

        case 'deleteContentBackward': {
          e.preventDefault();
          if (inicio.line !== fim.line || inicio.offset !== fim.offset) {
            aplicar(inicio, fim, '', true);
            return;
          }
          if (inicio.offset > 0) {
            aplicar({ ...inicio, offset: inicio.offset - 1 }, fim, '', true);
            return;
          }
          // No começo da linha, apagar junta com a de cima.
          if (inicio.line === 0) return;
          const acima = inicio.line - 1;
          aplicar({ line: acima, offset: linhas[acima].length }, fim, '', true);
          return;
        }

        case 'deleteContentForward': {
          e.preventDefault();
          if (inicio.line !== fim.line || inicio.offset !== fim.offset) {
            aplicar(inicio, fim, '', true);
            return;
          }
          if (inicio.offset < (linhas[inicio.line]?.length ?? 0)) {
            aplicar(inicio, { ...fim, offset: fim.offset + 1 }, '', true);
            return;
          }
          if (inicio.line >= linhas.length - 1) return;
          aplicar(inicio, { line: inicio.line + 1, offset: 0 }, '', true);
          return;
        }

        // Option+Backspace e Option+Delete no macOS, Ctrl+Backspace no resto.
        case 'deleteWordBackward': {
          e.preventDefault();
          if (inicio.line !== fim.line || inicio.offset !== fim.offset) {
            aplicar(inicio, fim, '');
            return;
          }
          const texto = linhas[inicio.line] ?? '';
          if (inicio.offset === 0) {
            if (inicio.line === 0) return;
            const acima = inicio.line - 1;
            aplicar({ line: acima, offset: linhas[acima].length }, fim, '');
            return;
          }
          aplicar({ ...inicio, offset: inicioDaPalavra(texto, inicio.offset) }, fim, '');
          return;
        }

        case 'deleteWordForward': {
          e.preventDefault();
          if (inicio.line !== fim.line || inicio.offset !== fim.offset) {
            aplicar(inicio, fim, '');
            return;
          }
          const texto = linhas[inicio.line] ?? '';
          if (inicio.offset >= texto.length) {
            if (inicio.line >= linhas.length - 1) return;
            aplicar(inicio, { line: inicio.line + 1, offset: 0 }, '');
            return;
          }
          aplicar(inicio, { ...fim, offset: fimDaPalavra(texto, fim.offset) }, '');
          return;
        }

        // Cmd+Backspace e Cmd+Delete: até a ponta da linha.
        case 'deleteSoftLineBackward':
        case 'deleteHardLineBackward':
          e.preventDefault();
          aplicar({ ...inicio, offset: 0 }, fim, '');
          return;

        case 'deleteSoftLineForward':
        case 'deleteHardLineForward':
          e.preventDefault();
          aplicar(inicio, { ...fim, offset: linhas[fim.line]?.length ?? 0 }, '');
          return;

        case 'deleteEntireSoftLine':
          e.preventDefault();
          aplicar(
            { ...inicio, offset: 0 },
            { ...fim, offset: linhas[fim.line]?.length ?? 0 },
            '',
          );
          return;

        case 'deleteByCut':
        case 'deleteByDrag':
          e.preventDefault();
          aplicar(inicio, fim, '');
          return;

        case 'insertFromPaste':
        case 'insertFromDrop': {
          const texto = e.dataTransfer?.getData('text/plain');
          e.preventDefault();
          if (texto) aplicar(inicio, fim, texto);
          return;
        }

        default:
          // Qualquer outra escrita (formatação em negrito pelo atalho do
          // navegador, por exemplo) não tem lugar aqui: o formato vem dos
          // sinais no texto, não de um comando de edição rica.
          e.preventDefault();
      }
    };

    raiz.addEventListener('beforeinput', aoEscrever);
    return () => raiz.removeEventListener('beforeinput', aoEscrever);
  }, [aplicar, lerSelecao, linhas]);

  /**
   * O cursor mudou de lugar: outra linha passa a mostrar os sinais.
   *
   * Só vale para o cursor sozinho. Com um trecho selecionado, trocar a linha
   * revelada redesenharia a superfície e o navegador perderia a seleção no
   * meio do arrasto: era isso que impedia selecionar com o mouse e com Cmd+A.
   */
  const sincronizarCursor = useCallback(() => {
    if (compondo.current) return;
    const nativa = window.getSelection();
    if (!nativa || !nativa.isCollapsed) return;
    const sel = lerSelecao();
    if (!sel) return;
    if (sel.inicio.line === ativa) return;
    paraColocar.current = sel.inicio;
    setAtiva(sel.inicio.line);
  }, [lerSelecao, ativa]);

  useEffect(() => {
    const aoMudarSelecao = () => {
      const raiz = superficie.current;
      const sel = window.getSelection();
      if (!raiz || !sel?.anchorNode || !raiz.contains(sel.anchorNode)) return;
      sincronizarCursor();
    };
    document.addEventListener('selectionchange', aoMudarSelecao);
    return () => document.removeEventListener('selectionchange', aoMudarSelecao);
  }, [sincronizarCursor]);

  /** O texto cru do que está selecionado. É isto que vai para a área de
   *  transferência: o desenho não tem os sinais das linhas sem cursor nem as
   *  quebras de linha, então copiar o DOM devolvia tudo grudado e sem `#`. */
  const recortar = useCallback(
    (e: React.ClipboardEvent, apagar: boolean) => {
      const sel = lerSelecao();
      if (!sel) return;
      const de = toAbsolute(linhas, sel.inicio.line, sel.inicio.offset);
      const ate = toAbsolute(linhas, sel.fim.line, sel.fim.offset);
      if (de === ate) return;

      e.preventDefault();
      e.clipboardData.setData('text/plain', value.slice(de, ate));
      if (apagar) aplicar(sel.inicio, sel.fim, '');
    },
    [lerSelecao, linhas, value, aplicar],
  );

  // Nota vazia: uma linha só, e o texto de ajuda no lugar do conteúdo.
  const vazia = value === '';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={superficie}
        // A superfície é um campo como qualquer outro, então veste o mesmo que
        // o Textarea veste. O que sobra em CSS à mão é só o que utilitário não
        // alcança: o tom do sinal e a aparência de cada tipo de linha.
        className={cn(
          'min-h-40 flex-1 overflow-y-auto rounded-xl border bg-glass px-4 py-3',
          'text-sm leading-relaxed shadow-e1 backdrop-blur-sm outline-none',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'md-superficie',
          vazia && 'is-vazia',
        )}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        data-placeholder={placeholder}
        spellCheck
        onCompositionStart={() => {
          compondo.current = true;
        }}
        onCompositionEnd={(e) => {
          compondo.current = false;
          // O navegador escreveu na linha ativa, que está com os sinais à
          // vista: o texto dela na tela é o texto cru.
          const divLinha = (e.target as HTMLElement)
            .closest('[data-linha]')
            ?.getAttribute('data-linha');
          const raiz = superficie.current;
          const alvo = divLinha ?? String(ativa);
          const texto = raiz?.querySelector(`[data-linha="${alvo}"]`)?.textContent ?? '';
          const i = Number(alvo);
          if (texto === linhas[i]) return;
          const proximo = [...linhas];
          proximo[i] = texto;
          paraColocar.current = { line: i, offset: texto.length };
          onChange(proximo.join('\n'));
        }}
        onKeyDown={(e) => {
          // Tab recua a linha em vez de sair do campo, que é o que o
          // navegador faria: é assim que uma lista ganha nível.
          if (e.key === 'Tab') {
            e.preventDefault();
            const sel = lerSelecao();
            if (!sel) return;
            const i = sel.inicio.line;
            const atual = linhas[i] ?? '';
            if (e.shiftKey) {
              if (!atual.startsWith(RECUO)) return;
              aplicar({ line: i, offset: 0 }, { line: i, offset: RECUO.length }, '');
              return;
            }
            aplicar({ line: i, offset: 0 }, { line: i, offset: 0 }, RECUO);
            return;
          }

          const atalho = e.metaKey || e.ctrlKey;
          if (atalho && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) voltar(refazer, desfazer);
            else voltar(desfazer, refazer);
            return;
          }
          if (atalho && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            voltar(refazer, desfazer);
          }
        }}
        onCopy={(e) => recortar(e, false)}
        onCut={(e) => recortar(e, true)}
        onPaste={(e) => {
          // Colar traz texto, não HTML: o formato desta nota mora nos sinais
          // dentro dela. Sem isto o navegador enfiaria a árvore copiada
          // dentro da superfície e não haveria como voltar ao texto.
          const texto = e.clipboardData.getData('text/plain');
          const sel = lerSelecao();
          e.preventDefault();
          if (texto && sel) aplicar(sel.inicio, sel.fim, texto);
        }}
        onKeyUp={sincronizarCursor}
        onMouseUp={sincronizarCursor}
        onFocus={sincronizarCursor}
      >
        {linhas.map((linha, i) => (
          <MarkdownLineSlot
            key={i}
            index={i}
            line={linha}
            sinais={i === ativa}
            inCode={emCodigo[i] ?? false}
            // O bloco de código é desenhado como um corpo só, embora as
            // linhas sejam independentes: a primeira arredonda em cima, a
            // última embaixo, e o fundo atravessa todas.
            topo={(emCodigo[i] ?? false) && !emCodigo[i - 1]}
            base={(emCodigo[i] ?? false) && !emCodigo[i + 1]}
          />
        ))}
      </div>
    </div>
  );
}

/** O invólucro que carrega o número da linha. O editor localiza a linha por
 *  este atributo, tanto para ler onde está o cursor quanto para recolocá-lo. */
function MarkdownLineSlot({
  index,
  line,
  sinais,
  inCode,
  topo,
  base,
}: {
  index: number;
  line: string;
  sinais: boolean;
  inCode: boolean;
  topo: boolean;
  base: boolean;
}) {
  const classe = [
    'md-slot',
    inCode && 'md-bloco',
    topo && 'is-topo',
    base && 'is-base',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div data-linha={index} className={classe}>
      <MarkdownLine line={line} sinais={sinais} inCode={inCode} />
    </div>
  );
}
