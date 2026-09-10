'use client';

import { memo } from 'react';
import type { ReactNode } from 'react';
import type { Inline, LineInfo } from '@/lib/markdown';
import { lineInfo, parseInline } from '@/lib/markdown';

// Uma linha da nota, desenhada de duas formas: com os sinais à vista e sem.
//
// A diferença entre as duas é só isso, emitir ou não os sinais. A formatação
// não muda: no Obsidian, a linha onde está o cursor continua com o título
// grande e o negrito em negrito, e o `#` aparece ao lado, apagado. Uma
// pré-visualização que troca o texto formatado por texto cru seria outra
// coisa, e não é o que se pediu.

/** Um sinal de marcação. Fica no fluxo do texto, então o cursor anda por
 *  cima dele como anda por cima de qualquer caractere. */
function Sinal({ children }: { children: string }) {
  return <span className="md-sinal">{children}</span>;
}

function renderInline(nodes: Inline[], sinais: boolean): ReactNode {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case 'text':
        return node.text;

      case 'escape':
        return sinais ? (
          <span key={i}>
            <Sinal>{'\\'}</Sinal>
            {node.text}
          </span>
        ) : (
          node.text
        );

      case 'code':
        return (
          <code key={i} className="md-code">
            {sinais && <Sinal>{node.marker}</Sinal>}
            {node.text}
            {sinais && <Sinal>{node.marker}</Sinal>}
          </code>
        );

      case 'wrap': {
        const dentro = (
          <>
            {sinais && <Sinal>{node.marker}</Sinal>}
            {renderInline(node.children, sinais)}
            {sinais && <Sinal>{node.marker}</Sinal>}
          </>
        );
        if (node.style === 'strong') return <strong key={i}>{dentro}</strong>;
        if (node.style === 'em') return <em key={i}>{dentro}</em>;
        if (node.style === 'strike') return <s key={i}>{dentro}</s>;
        if (node.style === 'mark') return <mark key={i}>{dentro}</mark>;
        return (
          <strong key={i}>
            <em>{dentro}</em>
          </strong>
        );
      }

      case 'link':
        // Com os sinais à vista a linha está em edição: ali o endereço é
        // texto, e clicar precisa colocar o cursor, não navegar.
        return sinais ? (
          <span key={i} className="md-link-cru">
            <Sinal>{node.open}</Sinal>
            {renderInline(node.children, sinais)}
            <Sinal>{node.close}</Sinal>
          </span>
        ) : (
          <a key={i} href={node.href} target="_blank" rel="noreferrer">
            {renderInline(node.children, sinais)}
          </a>
        );
    }
  });
}

/** A classe que dá a aparência do bloco, aplicada por linha. */
function classeDe(info: LineInfo): string {
  switch (info.kind) {
    case 'heading':
      return `md-linha md-h md-h${info.level}`;
    case 'quote':
      return 'md-linha md-quote';
    case 'bullet':
    case 'ordered':
    case 'task':
      return 'md-linha md-item';
    case 'fence':
      return 'md-linha md-cerca';
    case 'code':
      return 'md-linha md-mono';
    case 'rule':
      return 'md-linha md-rule-linha';
    default:
      return 'md-linha';
  }
}

/**
 * O marcador que substitui o sinal quando ele está escondido: o ponto da
 * lista, o número, a caixa de marcar.
 *
 * Vai num atributo, e o CSS o desenha num `::before`. Como nó de texto ele
 * entraria na contagem de caracteres da linha, e a posição que o navegador
 * informa para o cursor deixaria de corresponder ao texto cru.
 */
function marcador(info: LineInfo): string | undefined {
  if (info.kind === 'bullet') return '•';
  if (info.kind === 'ordered') return info.marker.trim();
  if (info.kind === 'task') return info.checked ? '☑' : '☐';
  return undefined;
}

export const MarkdownLine = memo(function MarkdownLine({
  line,
  sinais,
  inCode,
}: {
  line: string;
  sinais: boolean;
  inCode: boolean;
}) {
  const info = lineInfo(line, inCode);

  // Uma linha vazia precisa de altura: sem o <br> ela some e o cursor não tem
  // onde ficar.
  if (line === '') {
    return (
      <div className="md-linha">
        <br />
      </div>
    );
  }

  if (info.kind === 'rule') {
    return (
      <div className={classeDe(info)}>
        {sinais ? <Sinal>{info.marker}</Sinal> : <span className="md-rule" aria-hidden="true" />}
      </div>
    );
  }

  // A cerca é marcador inteiro: some quando o cursor não está nela, como o
  // `#` de um título. A linguagem sobra como rótulo, desenhado pelo CSS para
  // não entrar na contagem de caracteres.
  if (info.kind === 'fence') {
    return (
      <div className={classeDe(info)} data-lang={sinais ? undefined : info.lang || undefined}>
        {sinais ? <Sinal>{info.marker}</Sinal> : <br />}
      </div>
    );
  }

  // O recuo vai numa variável, não em `padding-left`: assim o CSS soma o
  // nível ao espaço do marcador em vez de substituí-lo.
  const recuo = { '--md-nivel': info.depth } as React.CSSProperties;

  return (
    <div
      className={classeDe(info)}
      style={recuo}
      data-marcador={sinais ? undefined : marcador(info)}
      data-marcada={info.kind === 'task' && info.checked ? 'sim' : undefined}
    >
      {sinais && info.marker !== '' && <Sinal>{info.marker}</Sinal>}
      {info.kind === 'code' ? info.content : renderInline(parseInline(info.content), sinais)}
      {/* Sem conteúdo depois do prefixo (um `- ` recém-digitado), o <br>
          mantém a linha com altura e o cursor dentro dela. */}
      {info.content === '' && <br />}
    </div>
  );
});
