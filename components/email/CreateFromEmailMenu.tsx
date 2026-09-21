'use client';

import { useState } from 'react';
import { MoreVertical, NotebookPen, ListTodo } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  /** Só em tela estreita: as ações que no desktop têm botão próprio na linha. */
  narrow?: {
    tagFolders: string[];
    onOpenTags: () => void;
    onTag: (folder: string) => void;
    onDelete: () => void;
  };
}

export function CreateFromEmailMenu({
  subject,
  folders,
  busy,
  onCreate,
  onOpen,
  narrow,
}: Props) {
  const [pasta, setPasta] = useState('');

  return (
    <DropdownMenu
      onOpenChange={(aberto) => {
        if (!aberto) return;
        onOpen?.();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Ações de ${subject || '(sem assunto)'}`}
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-sm text-ink-dim transition-colors lg:inline-block lg:size-auto lg:p-1',
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

        {narrow && (
          <>
            <DropdownMenuSeparator className="lg:hidden" />
            <DropdownMenuSub onOpenChange={(aberto) => aberto && narrow.onOpenTags()}>
              <DropdownMenuSubTrigger role="presentation" className="min-h-10 lg:hidden">
                Etiquetar
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {narrow.tagFolders.length === 0 ? (
                  <DropdownMenuItem disabled className="min-h-10 lg:hidden">
                    Carregando etiquetas…
                  </DropdownMenuItem>
                ) : (
                  narrow.tagFolders.map((folder) => (
                    <DropdownMenuItem
                      key={folder}
                      className="min-h-10 lg:hidden"
                      onSelect={() => narrow.onTag(folder)}
                    >
                      {folder}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              role="presentation"
              variant="destructive"
              className="min-h-10 lg:hidden"
              onSelect={narrow.onDelete}
            >
              Excluir
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
