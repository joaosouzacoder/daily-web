'use client';

import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/utils';

// O texto da nota é entrada de usuário, então a renderização se defende em
// três camadas: o react-markdown monta elementos React (nunca innerHTML) e
// descarta HTML cru; o rehype-sanitize passa a árvore pela lista de
// elementos e atributos permitidos do GitHub; e a transformação de URL
// padrão tira `javascript:` e afins de links e imagens.
//
// O realce de código roda DEPOIS da sanitização: ele só acrescenta spans com
// classe `hljs-*` em cima de uma árvore já limpa, e a lista do sanitizador
// não precisa abrir exceção para essas classes.
const REHYPE_PLUGINS: Options['rehypePlugins'] = [
  [rehypeSanitize, defaultSchema],
  // Só realça bloco com a linguagem declarada: adivinhar erra em texto curto.
  [rehypeHighlight, { detect: false }],
];
const REMARK_PLUGINS: Options['remarkPlugins'] = [remarkGfm];

const COMPONENTS: Components = {
  // Link de nota abre fora da app: clicar num endereço no meio da leitura não
  // pode trocar o painel inteiro. `noopener` corta o `window.opener` da
  // página aberta.
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
  ),
};

export function MarkdownView({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn('markdown-body', className)}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
