'use client';

import { useState } from 'react';
import { MoreVertical, NotebookPen, ListTodo } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { focusRing, selectClass } from '@/lib/theme';
import type { NoteFolder } from '@/lib/types';

/**
 * O que dá para fazer com um e-mail além de lê-lo: virar nota ou virar tarefa.
 *
 * Fica num menu para a linha não encher de botões, e o menu é o do sistema de
 * design — o teclado chega nele, abre com Enter e anda com as setas.
 */

export type CreateKind = 'note' | 'task';

interface Props {
  /** Assunto, só para os rótulos do menu dizerem de qual mensagem se trata. */
  subject: string;
  folders: NoteFolder[];
  /** Em voo: enquanto está, os itens não respondem — um clique repetido não
   *  pode virar duas notas. */
  busy: boolean;
  onCreate: (kind: CreateKind, folderId: string | null) => void;
  /** Carrega as pastas quando o menu abre: pedir antes seria uma ida por
   *  linha da lista. */
  onOpen?: () => void;
}

export function CreateFromEmailMenu({ subject, folders, busy, onCreate, onOpen }: Props) {
  const [pasta, setPasta] = useState('');

  return (
    <DropdownMenu onOpenChange={(aberto) => aberto && onOpen?.()}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Ações de ${subject || '(sem assunto)'}`}
          className={cn(
            'shrink-0 rounded-sm p-1 text-ink-dim transition-colors',
            'hover:bg-neutral-tint hover:text-ink motion-reduce:transition-none',
            focusRing,
          )}
        >
          <MoreVertical className="size-4" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Criar a partir deste e-mail</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* A pasta é escolhida antes de criar. O menu não fecha ao mexer aqui:
            o seletor não é um item do menu, é parte da escolha. */}
        <div
          className="px-2 py-1.5"
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <label className="flex flex-col gap-1 type-caption text-ink-dim">
            Pasta da nota
            <select
              className={cn(selectClass, focusRing, 'w-full')}
              value={pasta}
              onChange={(e) => setPasta(e.target.value)}
            >
              <option value="">Sem pasta</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <DropdownMenuItem disabled={busy} onSelect={() => onCreate('note', pasta || null)}>
          <NotebookPen className="size-4" />
          Criar nota
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={() => onCreate('task', null)}>
          <ListTodo className="size-4" />
          Criar tarefa
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
