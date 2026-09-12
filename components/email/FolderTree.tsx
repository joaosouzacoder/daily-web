'use client';

import { useState } from 'react';
import {
  Inbox,
  Send,
  Trash2,
  FileText,
  Archive,
  AlertOctagon,
  Folder,
  MailOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MailboxNode } from '@/lib/types';

/** O ícone vem da flag de uso especial, que o servidor declara — e não do
 *  nome, que muda por provedor e por idioma. */
function icone(node: MailboxNode) {
  if (node.path.toUpperCase() === 'INBOX') return <Inbox className="size-4" />;
  if (node.specialUse === '\\Sent') return <Send className="size-4" />;
  if (node.specialUse === '\\Trash') return <Trash2 className="size-4" />;
  if (node.specialUse === '\\Drafts') return <FileText className="size-4" />;
  if (node.specialUse === '\\Archive') return <Archive className="size-4" />;
  if (node.specialUse === '\\Junk') return <AlertOctagon className="size-4" />;
  return <Folder className="size-4" />;
}

/** A profundidade sai do caminho: o servidor separa os níveis com o próprio
 *  delimitador ("[Gmail]/Importante", "trabalho.clientes"). */
export function depthOf(node: MailboxNode): number {
  if (!node.delimiter) return 0;
  return node.path.split(node.delimiter).length - 1;
}

/** O tipo que viaja no arraste. Um tipo próprio é o que faz a pasta aceitar a
 *  soltura de uma linha de e-mail e recusar qualquer outra coisa. */
export const EMAIL_DRAG_TYPE = 'application/x-daily-web-email';

interface Props {
  mailboxes: MailboxNode[];
  selected: string;
  onSelect: (path: string) => void;
  /** Soltar as mensagens arrastadas nesta pasta. Ausente, a árvore não aceita
   *  soltura — é o que vale quando não há nada arrastável na tela. */
  onDropMessages?: (path: string) => void;
  onMarkRead?: (node: MailboxNode) => void;
  loading?: boolean;
  error?: string | null;
}

export function FolderTree({
  mailboxes,
  selected,
  onSelect,
  onDropMessages,
  onMarkRead,
  loading = false,
  error = null,
}: Props) {
  const [alvo, setAlvo] = useState<string | null>(null);

  if (error) {
    return (
      <p role="alert" className="px-2 py-3 type-caption text-danger">
        {error}
      </p>
    );
  }

  if (loading && mailboxes.length === 0) {
    return <p className="px-2 py-3 type-caption text-ink-dim">Carregando pastas…</p>;
  }

  return (
    <nav aria-label="Pastas">
      <ul className="flex flex-col gap-0.5 text-sm">
        {mailboxes.map((node) => {
          const ativa = node.path === selected;
          const recebendo = alvo === node.path;
          return (
            <li
              key={node.path}
              className={cn(
                'group/pasta relative flex items-center rounded-md',
                // A pasta sob o cursor durante o arraste se anuncia: sem isso
                // não dá para saber onde a soltura vai cair.
                recebendo && 'bg-brand-tint ring-1 ring-brand-edge',
              )}
              onDragOver={
                onDropMessages
                  ? (e) => {
                      // Sem impedir o padrão, o navegador recusa a soltura.
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setAlvo(node.path);
                    }
                  : undefined
              }
              onDragLeave={onDropMessages ? () => setAlvo((a) => (a === node.path ? null : a)) : undefined}
              onDrop={
                onDropMessages
                  ? (e) => {
                      e.preventDefault();
                      setAlvo(null);
                      if (e.dataTransfer.types.includes(EMAIL_DRAG_TYPE)) onDropMessages(node.path);
                    }
                  : undefined
              }
            >
              <button
                type="button"
                aria-current={ativa ? 'true' : undefined}
                // O nome acessível vem daqui: a contagem ao lado é um número
                // solto, que lido em voz alta não diz o que é.
                aria-label={
                  node.unread > 0
                    ? `${node.name || node.path}, ${node.unread} não lidas`
                    : node.name || node.path
                }
                onClick={() => onSelect(node.path)}
                style={{ paddingLeft: `${0.5 + depthOf(node) * 0.75}rem` }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left',
                  ativa ? 'bg-brand-tint font-medium text-brand' : 'text-ink-mid hover:bg-neutral-tint',
                )}
              >
                <span className="shrink-0 text-ink-dim">{icone(node)}</span>
                <span className="w-full truncate">{node.name || node.path}</span>
                {node.unread > 0 && (
                  <span className="shrink-0 rounded-full border border-brand-edge bg-brand-tint px-1.5 type-caption text-brand">
                    {node.unread}
                  </span>
                )}
              </button>
              {/* Marcar a pasta inteira como lida. Fica escondido até a pasta
                  receber o cursor ou o foco, para a árvore não virar uma
                  parede de botões. */}
              {onMarkRead && node.unread > 0 && (
                <button
                  type="button"
                  onClick={() => onMarkRead(node)}
                  title={`Marcar ${node.name || node.path} como lida`}
                  aria-label={`Marcar ${node.name || node.path} como lida`}
                  className={cn(
                    'absolute right-1 rounded-sm p-1 text-ink-dim opacity-0 transition-opacity',
                    'hover:bg-neutral-tint hover:text-ink focus-visible:opacity-100',
                    'group-hover/pasta:opacity-100 motion-reduce:transition-none',
                  )}
                >
                  <MailOpen className="size-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
