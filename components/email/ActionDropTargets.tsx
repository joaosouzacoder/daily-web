'use client';

import { useState } from 'react';
import { Mail, MailOpen, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tabular } from '@/lib/theme';
import { EMAIL_DRAG_TYPE } from './FolderTree';

/**
 * Onde soltar o que está sendo arrastado. Aparece quando o arraste começa e
 * some quando ele termina: fora do arraste as três ações já estão na barra do
 * painel, em botões, e uma faixa fixa só roubaria espaço da lista.
 *
 * A ação só acontece sobre um alvo válido. Soltar no vazio não faz nada — é o
 * jeito de desistir no meio do caminho.
 */

export type DropAction = 'read' | 'unread' | 'delete';

interface Alvo {
  action: DropAction;
  /** Nome acessível. Contém o texto visível, que é o que se lê no botão. */
  label: string;
  /** Texto na tela, quando ele é mais curto que o nome acessível. */
  text?: string;
  /** O que vai acontecer, dito por extenso quando o cursor está em cima. */
  hint: string;
  icon: React.ReactNode;
  destructive?: boolean;
}

const ALVOS: Alvo[] = [
  {
    action: 'read',
    label: 'Marcar como lido',
    // O cartão do painel é estreito: o texto na tela é curto e o nome
    // acessível diz a ação por inteiro.
    text: 'Lido',
    hint: 'Solte para marcar como lido',
    icon: <MailOpen className="size-4" />,
  },
  {
    action: 'unread',
    label: 'Marcar como não lido',
    text: 'Não lido',
    hint: 'Solte para marcar como não lido',
    icon: <Mail className="size-4" />,
  },
  {
    action: 'delete',
    // O nome acessível diz de quais mensagens se trata: o botão da barra
    // também se chama "Excluir", e os dois convivem durante o arraste.
    label: 'Excluir as conversas arrastadas',
    text: 'Excluir',
    hint: 'Solte para mover para a lixeira',
    icon: <Trash2 className="size-4" />,
    destructive: true,
  },
];

interface Props {
  /** Quantas conversas o arraste carrega. Zero esconde a faixa. */
  count: number;
  active: boolean;
  onDrop: (action: DropAction) => void;
}

export function ActionDropTargets({ count, active, onDrop }: Props) {
  const [sobre, setSobre] = useState<DropAction | null>(null);

  if (!active || count === 0) return null;

  return (
    <div
      // A faixa anuncia o que está em jogo: a contagem some da barra quando o
      // arraste começa, e aqui ela reaparece junto dos alvos.
      role="group"
      aria-label={`Soltar ${count} ${count === 1 ? 'conversa' : 'conversas'} em uma ação`}
      className={cn(
        'flex flex-wrap items-stretch gap-2 rounded-lg border border-dashed border-brand-edge',
        'bg-brand-tint/40 p-2 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150',
      )}
    >
      <span
        className={cn(
          'flex items-center gap-2 rounded-md px-2 type-caption text-brand',
          tabular,
        )}
      >
        <span className="rounded-full border border-brand-edge bg-brand-tint px-1.5">{count}</span>
        {count === 1 ? 'conversa' : 'conversas'}
      </span>

      {ALVOS.map((alvo) => {
        const emCima = sobre === alvo.action;
        return (
          <button
            key={alvo.action}
            type="button"
            // Botão de verdade: o mesmo alvo serve ao clique de quem não
            // arrasta e ao teclado, que não tem arraste nenhum.
            aria-label={alvo.label}
            aria-current={emCima ? 'true' : undefined}
            onClick={() => onDrop(alvo.action)}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(EMAIL_DRAG_TYPE)) return;
              // Sem impedir o padrão, o navegador recusa a soltura.
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setSobre(alvo.action);
            }}
            onDragLeave={() => setSobre((a) => (a === alvo.action ? null : a))}
            onDrop={(e) => {
              e.preventDefault();
              setSobre(null);
              if (e.dataTransfer.types.includes(EMAIL_DRAG_TYPE)) onDrop(alvo.action);
            }}
            className={cn(
              'flex min-w-[7.5rem] flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2',
              'text-sm transition-colors duration-100 ease-brand motion-reduce:transition-none',
              alvo.destructive
                ? 'border-line-strong text-ink-mid hover:border-danger/40 hover:text-danger'
                : 'border-line-strong text-ink-mid hover:border-brand-edge hover:text-brand',
              emCima &&
                (alvo.destructive
                  ? 'border-danger bg-danger/10 text-danger'
                  : 'border-brand bg-brand-tint text-brand'),
            )}
          >
            <span className="shrink-0">{alvo.icon}</span>
            <span className="truncate">{emCima ? alvo.hint : (alvo.text ?? alvo.label)}</span>
          </button>
        );
      })}
    </div>
  );
}
