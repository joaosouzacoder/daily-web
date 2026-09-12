'use client';

import { Inbox, Send, Trash2, FileText, Archive, AlertOctagon, Folder } from 'lucide-react';
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

interface Props {
  mailboxes: MailboxNode[];
  selected: string;
  onSelect: (path: string) => void;
  loading?: boolean;
  error?: string | null;
}

export function FolderTree({ mailboxes, selected, onSelect, loading = false, error = null }: Props) {
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
          return (
            <li key={node.path}>
              <button
                type="button"
                aria-current={ativa ? 'true' : undefined}
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
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
