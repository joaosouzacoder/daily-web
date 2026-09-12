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
  ChevronRight,
  RotateCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { MailboxNode, MailboxRef } from '@/lib/types';

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

/** Uma conta e o que se sabe das pastas dela. Cada uma carrega o próprio
 *  estado: uma caixa fora do ar não pode segurar as outras. */
export interface MailboxGroup {
  account: MailboxRef;
  mailboxes: MailboxNode[];
  /** Nada guardado ainda: é a primeira vez que esta conta é aberta. */
  loading: boolean;
  /** Lendo do servidor por cima do que já está na tela. */
  syncing: boolean;
  error: string | null;
}

export interface FolderSelection {
  account: string;
  path: string;
}

interface Props {
  groups: MailboxGroup[];
  selected: FolderSelection;
  onSelect: (selection: FolderSelection) => void;
  /** Soltar as mensagens arrastadas nesta pasta. Ausente, a árvore não aceita
   *  soltura — é o que vale quando não há nada arrastável na tela. */
  onDropMessages?: (selection: FolderSelection) => void;
  onMarkRead?: (account: string, node: MailboxNode) => void;
  onRetry?: (account: string) => void;
}

export function FolderTree({
  groups,
  selected,
  onSelect,
  onDropMessages,
  onMarkRead,
  onRetry,
}: Props) {
  const [alvo, setAlvo] = useState<string | null>(null);
  // Contas recolhidas. O padrão é aberto: o normal é querer ver as pastas.
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set());

  const alternar = (accountId: string) =>
    setRecolhidas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(accountId)) proximo.delete(accountId);
      else proximo.add(accountId);
      return proximo;
    });

  return (
    <nav aria-label="Pastas" className="flex flex-col gap-3">
      {groups.map((group) => {
        const aberta = !recolhidas.has(group.account.id);
        return (
          <section key={group.account.id} aria-label={group.account.label}>
            <h3 className="flex items-center gap-1 px-1 pb-1">
              <button
                type="button"
                onClick={() => alternar(group.account.id)}
                aria-expanded={aberta}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-1 rounded-sm py-0.5 text-left',
                  'type-caption uppercase tracking-wide text-ink-dim hover:text-ink-mid',
                )}
              >
                <ChevronRight
                  className={cn(
                    'size-3 shrink-0 transition-transform duration-150 motion-reduce:transition-none',
                    aberta && 'rotate-90',
                  )}
                />
                <span className="truncate">{group.account.label}</span>
              </button>
              {/* A leitura de fundo se anuncia sem tirar nada da tela. */}
              {group.syncing && (
                <RotateCw
                  aria-label={`atualizando ${group.account.label}`}
                  className="size-3 shrink-0 animate-spin text-ink-dim motion-reduce:animate-none"
                />
              )}
            </h3>

            {group.error && (
              <p role="alert" className="flex items-center gap-2 px-2 py-1 type-caption text-danger">
                <span className="min-w-0 truncate">{group.error}</span>
                {onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(group.account.id)}
                    className="shrink-0 underline underline-offset-2 hover:no-underline"
                  >
                    tentar de novo
                  </button>
                )}
              </p>
            )}

            {aberta &&
              (group.loading && group.mailboxes.length === 0 ? (
                <p className="px-2 py-1 type-caption text-ink-dim">Carregando pastas…</p>
              ) : group.mailboxes.length === 0 && !group.error ? (
                <p className="px-2 py-1 type-caption text-ink-dim">Nenhuma pasta.</p>
              ) : (
                <ul className="flex flex-col gap-0.5 text-sm">
                  {group.mailboxes.map((node) => {
                    const chave = `${group.account.id} ${node.path}`;
                    const ativa =
                      selected.account === group.account.id && selected.path === node.path;
                    const recebendo = alvo === chave;
                    return (
                      <li
                        key={chave}
                        className={cn(
                          'group/pasta relative rounded-md',
                          recebendo && 'bg-brand-tint ring-1 ring-brand-edge',
                        )}
                        onDragOver={
                          onDropMessages
                            ? (e) => {
                                // Sem impedir o padrão, o navegador recusa a soltura.
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                setAlvo(chave);
                              }
                            : undefined
                        }
                        onDragLeave={
                          onDropMessages
                            ? () => setAlvo((a) => (a === chave ? null : a))
                            : undefined
                        }
                        onDrop={
                          onDropMessages
                            ? (e) => {
                                e.preventDefault();
                                setAlvo(null);
                                if (e.dataTransfer.types.includes(EMAIL_DRAG_TYPE)) {
                                  onDropMessages({ account: group.account.id, path: node.path });
                                }
                              }
                            : undefined
                        }
                      >
                        {/* Nome, contagem e ação têm cada um o seu espaço: o
                            botão não pode cobrir o número, nem em coluna
                            estreita. */}
                        <div
                          className={cn(
                            'grid items-center gap-1 rounded-md',
                            'grid-cols-[minmax(0,1fr)_auto_1.75rem]',
                            ativa ? 'bg-brand-tint' : 'hover:bg-neutral-tint',
                          )}
                        >
                          <button
                            type="button"
                            aria-current={ativa ? 'true' : undefined}
                            // O nome acessível vem daqui: a contagem ao lado é
                            // um número solto, que lido em voz alta não diz o
                            // que é, e a conta distingue pastas homônimas.
                            aria-label={
                              node.unread > 0
                                ? `${node.name || node.path} em ${group.account.label}, ${node.unread} não lidas`
                                : `${node.name || node.path} em ${group.account.label}`
                            }
                            onClick={() =>
                              onSelect({ account: group.account.id, path: node.path })
                            }
                            style={{ paddingLeft: `${0.5 + depthOf(node) * 0.75}rem` }}
                            className={cn(
                              'flex min-w-0 items-center gap-2 py-1.5 pr-1 text-left',
                              ativa ? 'font-medium text-brand' : 'text-ink-mid',
                            )}
                          >
                            <span className="shrink-0 text-ink-dim">{icone(node)}</span>
                            <span className="truncate">{node.name || node.path}</span>
                          </button>

                          <span
                            aria-hidden
                            className={cn(
                              'justify-self-end rounded-full px-1.5 type-caption',
                              node.unread > 0
                                ? 'border border-brand-edge bg-brand-tint text-brand'
                                : 'text-transparent',
                            )}
                          >
                            {node.unread > 0 ? node.unread : '0'}
                          </span>

                          {/* Espaço reservado mesmo sem botão: sem isso a
                              contagem dança quando o cursor entra na linha. */}
                          <span className="flex size-7 items-center justify-center">
                            {onMarkRead && node.unread > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => onMarkRead(group.account.id, node)}
                                    aria-label={`Marcar a pasta ${node.name || node.path} de ${group.account.label} como lida`}
                                    className={cn(
                                      'rounded-sm p-1 text-ink-dim opacity-0 transition-opacity',
                                      'hover:bg-neutral-tint hover:text-ink focus-visible:opacity-100',
                                      'group-hover/pasta:opacity-100 motion-reduce:transition-none',
                                    )}
                                  >
                                    <MailOpen className="size-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  Marca como lidos os e-mails de{' '}
                                  <strong>{node.name || node.path}</strong> em{' '}
                                  <strong>{group.account.label}</strong>, inclusive os que ainda
                                  não foram carregados aqui. Não é o mesmo que marcar os
                                  selecionados.
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ))}
          </section>
        );
      })}
    </nav>
  );
}
