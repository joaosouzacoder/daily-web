'use client';

import { useState, type DragEvent } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Inbox,
  Layers,
  MoreHorizontal,
} from 'lucide-react';
import { Trash } from 'iconoir-react';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { focusRing } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { buildFolderTree, folderPath } from '@/lib/notesTree';
import type { Note, NoteFolder, NoteFolderNode } from '@/lib/types';

/** O que a barra lateral está mostrando. "Todas" e "Sem pasta" não são
 *  pastas no banco: são as duas visões que sempre existem. */
export type Scope = { kind: 'all' } | { kind: 'none' } | { kind: 'folder'; id: string };

export const ALL_KEY = '__all__';
export const NONE_KEY = '__none__';

export function scopeKey(scope: Scope): string {
  return scope.kind === 'folder' ? scope.id : scope.kind === 'all' ? ALL_KEY : NONE_KEY;
}

/** Os tipos do arraste. Um tipo próprio por coisa arrastada é o que faz a
 *  pasta aceitar uma nota e recusar o resto. */
export const NOTE_DRAG_TYPE = 'application/x-daily-web-note';
export const FOLDER_DRAG_TYPE = 'application/x-daily-web-note-folder';

interface Props {
  folders: NoteFolder[];
  notes: Note[];
  activeNoteId: string | null;
  scope: Scope;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onSelectScope: (scope: Scope) => void;
  onSelectNote: (id: string) => void;
  onMoveNote: (noteId: string, folderId: string | null) => void;
  onMoveFolder: (folderId: string, parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onCreateFolder: (parentId: string | null) => void;
  onDeleteFolder: (folder: NoteFolder) => void;
  onRenameNote: (id: string, title: string) => void;
  onDeleteNote: (note: Note) => void;
  /** Qual linha está com o campo de renomear aberto. Fica fora daqui porque
   *  a pasta recém-criada já nasce sendo renomeada, e quem cria é o painel. */
  renaming: string | null;
  onRenaming: (id: string | null) => void;
}

const ROW =
  'group/linha flex w-full items-center gap-1.5 rounded-md py-1.5 pr-1 text-left text-sm transition-colors duration-100 ease-brand motion-reduce:transition-none';

export function NoteTree({
  folders,
  notes,
  activeNoteId,
  scope,
  expanded,
  onToggle,
  onSelectScope,
  onSelectNote,
  onMoveNote,
  onMoveFolder,
  onRenameFolder,
  onCreateFolder,
  onDeleteFolder,
  onRenameNote,
  onDeleteNote,
  renaming: renomeando,
  onRenaming: setRenomeando,
}: Props) {
  const [alvo, setAlvo] = useState<string | null>(null);

  const tree = buildFolderTree(folders);
  const soltas = notes.filter((n) => n.folderId === null);
  const notesOf = (folderId: string) => notes.filter((n) => n.folderId === folderId);
  const selecionada = scopeKey(scope);

  /** Aceita a soltura de uma nota (sempre) e de uma pasta (quando o destino
   *  não é ela mesma). O navegador só deixa soltar se o padrão for impedido. */
  const dropHandlers = (key: string, folderId: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.some((t) => t === NOTE_DRAG_TYPE || t === FOLDER_DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setAlvo(key);
    },
    onDragLeave: () => setAlvo((a) => (a === key ? null : a)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setAlvo(null);
      const noteId = e.dataTransfer.getData(NOTE_DRAG_TYPE);
      if (noteId) {
        onMoveNote(noteId, folderId);
        return;
      }
      const draggedFolder = e.dataTransfer.getData(FOLDER_DRAG_TYPE);
      if (draggedFolder && draggedFolder !== folderId) onMoveFolder(draggedFolder, folderId);
    },
  });

  const linhaNota = (note: Note, depth: number) => {
    const ativa = note.id === activeNoteId;
    return (
      <li key={note.id} className="list-none">
        {renomeando === note.id ? (
          <Input
            className="h-8 min-w-0 px-2 text-sm"
            style={{ marginLeft: `${0.5 + depth * 0.75}rem` }}
            aria-label={`renomear ${note.title || 'sem título'}`}
            defaultValue={note.title}
            autoFocus
            onBlur={(e) => {
              setRenomeando(null);
              onRenameNote(note.id, e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setRenomeando(null);
            }}
          />
        ) : (
          <div
            className={cn(
              ROW,
              ativa
                ? [
                    'bg-[linear-gradient(to_right,var(--brand-tint),transparent_85%)] text-ink',
                    "relative before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-brand before:content-['']",
                    'dark:before:shadow-[0_0_8px_0_var(--brand)]',
                  ]
                : 'text-ink-mid hover:bg-glass-line hover:text-ink',
            )}
            style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(NOTE_DRAG_TYPE, note.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
          >
            <FileText className="size-3.5 shrink-0 text-ink-dim" aria-hidden />
            <button
              type="button"
              className={cn('min-w-0 flex-1 truncate text-left', focusRing)}
              aria-current={ativa}
              onClick={() => onSelectNote(note.id)}
              onDoubleClick={() => setRenomeando(note.id)}
              title="Clique duplo para renomear"
            >
              {note.title || 'sem título'}
            </button>
            <NoteMenu
              note={note}
              folders={folders}
              onRename={() => setRenomeando(note.id)}
              onMove={(folderId) => onMoveNote(note.id, folderId)}
              onDelete={() => onDeleteNote(note)}
            />
          </div>
        )}
      </li>
    );
  };

  const linhaPasta = (node: NoteFolderNode) => {
    const aberta = expanded.has(node.id);
    const ativa = selecionada === node.id;
    const dentro = notesOf(node.id);
    const recebendo = alvo === node.id;

    return (
      <li key={node.id} className="list-none">
        {renomeando === node.id ? (
          <Input
            className="h-8 min-w-0 px-2 text-sm"
            style={{ marginLeft: `${0.5 + node.depth * 0.75}rem` }}
            aria-label={`renomear pasta ${node.name}`}
            defaultValue={node.name}
            autoFocus
            onBlur={(e) => {
              setRenomeando(null);
              onRenameFolder(node.id, e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setRenomeando(null);
            }}
          />
        ) : (
          <div
            className={cn(
              ROW,
              ativa ? 'bg-brand-tint font-medium text-brand' : 'text-ink-mid hover:bg-glass-line',
              recebendo && 'bg-brand-tint ring-1 ring-brand-edge',
            )}
            style={{ paddingLeft: `${0.25 + node.depth * 0.75}rem` }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(FOLDER_DRAG_TYPE, node.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            {...dropHandlers(node.id, node.id)}
          >
            <button
              type="button"
              className={cn('shrink-0 rounded-sm p-0.5 text-ink-dim hover:text-ink', focusRing)}
              aria-label={`${aberta ? 'Recolher' : 'Expandir'} ${node.name}`}
              aria-expanded={aberta}
              onClick={() => onToggle(node.id)}
            >
              {aberta ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
            <span className="shrink-0 text-ink-dim" aria-hidden>
              {aberta ? <FolderOpen className="size-4" /> : <Folder className="size-4" />}
            </span>
            <button
              type="button"
              className={cn('min-w-0 flex-1 truncate text-left', focusRing)}
              aria-current={ativa}
              onClick={() => onSelectScope({ kind: 'folder', id: node.id })}
              onDoubleClick={() => setRenomeando(node.id)}
            >
              {node.name}
            </button>
            {dentro.length > 0 && (
              <span className="shrink-0 type-caption text-ink-dim">{dentro.length}</span>
            )}
            <FolderMenu
              folder={node}
              folders={folders}
              onRename={() => setRenomeando(node.id)}
              onCreate={() => {
                if (!expanded.has(node.id)) onToggle(node.id);
                onCreateFolder(node.id);
              }}
              onMove={(parentId) => onMoveFolder(node.id, parentId)}
              onDelete={() => onDeleteFolder(node)}
            />
          </div>
        )}

        {aberta && (
          <ul>
            {node.children.map(linhaPasta)}
            {dentro.map((note) => linhaNota(note, node.depth + 1))}
            {node.children.length === 0 && dentro.length === 0 && (
              <li
                className="list-none py-1 type-caption text-ink-dim"
                style={{ paddingLeft: `${1.75 + node.depth * 0.75}rem` }}
              >
                pasta vazia
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  const aberturaSoltas = expanded.has(NONE_KEY);

  return (
    <nav aria-label="pastas e notas" className="min-w-0">
      <ul className="flex flex-col gap-0.5">
        {/* "Todas as notas" é a visão, não um lugar: ela não tem filhas.
            Cada nota aparece uma vez só, sob a pasta dela ou sob "Sem
            pasta" — duas cópias da mesma linha seriam dois alvos para o
            mesmo clique. */}
        <li className="list-none">
          <div
            className={cn(
              ROW,
              'pl-7',
              selecionada === ALL_KEY
                ? 'bg-brand-tint font-medium text-brand'
                : 'text-ink-mid hover:bg-glass-line',
            )}
          >
            <Layers className="size-4 shrink-0 text-ink-dim" aria-hidden />
            <button
              type="button"
              className={cn('min-w-0 flex-1 truncate text-left', focusRing)}
              aria-current={selecionada === ALL_KEY}
              onClick={() => onSelectScope({ kind: 'all' })}
            >
              Todas as notas
            </button>
            <span className="shrink-0 type-caption text-ink-dim">{notes.length}</span>
          </div>
        </li>

        <li className="list-none">
          <div
            className={cn(
              ROW,
              'pl-1',
              selecionada === NONE_KEY
                ? 'bg-brand-tint font-medium text-brand'
                : 'text-ink-mid hover:bg-glass-line',
              alvo === NONE_KEY && 'bg-brand-tint ring-1 ring-brand-edge',
            )}
            {...dropHandlers(NONE_KEY, null)}
          >
            <button
              type="button"
              className={cn('shrink-0 rounded-sm p-0.5 text-ink-dim hover:text-ink', focusRing)}
              aria-label={`${aberturaSoltas ? 'Recolher' : 'Expandir'} sem pasta`}
              aria-expanded={aberturaSoltas}
              onClick={() => onToggle(NONE_KEY)}
            >
              {aberturaSoltas ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
            <Inbox className="size-4 shrink-0 text-ink-dim" aria-hidden />
            <button
              type="button"
              className={cn('min-w-0 flex-1 truncate text-left', focusRing)}
              aria-current={selecionada === NONE_KEY}
              onClick={() => onSelectScope({ kind: 'none' })}
            >
              Sem pasta
            </button>
            <span className="shrink-0 type-caption text-ink-dim">{soltas.length}</span>
          </div>
          {aberturaSoltas && <ul>{soltas.map((note) => linhaNota(note, 1))}</ul>}
        </li>

        {tree.map(linhaPasta)}
      </ul>
    </nav>
  );
}

/** O menu de uma pasta. "Mover para" lista as pastas possíveis pelo caminho
 *  inteiro — dois "Clientes" em ramos diferentes não se confundem. */
function FolderMenu({
  folder,
  folders,
  onRename,
  onCreate,
  onMove,
  onDelete,
}: {
  folder: NoteFolder;
  folders: NoteFolder[];
  onRename: () => void;
  onCreate: () => void;
  onMove: (parentId: string | null) => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'shrink-0 rounded-sm px-1 text-ink-dim opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover/linha:opacity-100 motion-reduce:transition-none',
          focusRing,
        )}
        aria-label={`ações da pasta ${folder.name}`}
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onRename}>Renomear</DropdownMenuItem>
        <DropdownMenuItem onSelect={onCreate}>Nova subpasta</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onMove(null)}>Mover para a raiz</DropdownMenuItem>
        {folders
          .filter((f) => f.id !== folder.id && f.id !== folder.parentId)
          .map((f) => (
            <DropdownMenuItem key={f.id} onSelect={() => onMove(f.id)}>
              Mover para {folderPath(folders, f.id).join(' / ')}
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          Apagar pasta
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NoteMenu({
  note,
  folders,
  onRename,
  onMove,
  onDelete,
}: {
  note: Note;
  folders: NoteFolder[];
  onRename: () => void;
  onMove: (folderId: string | null) => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'shrink-0 rounded-sm px-1 text-ink-dim opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover/linha:opacity-100 motion-reduce:transition-none',
          focusRing,
        )}
        aria-label={`ações de ${note.title || 'sem título'}`}
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onRename}>Renomear</DropdownMenuItem>
        <DropdownMenuSeparator />
        {note.folderId !== null && (
          <DropdownMenuItem onSelect={() => onMove(null)}>Mover para Sem pasta</DropdownMenuItem>
        )}
        {folders
          .filter((f) => f.id !== note.folderId)
          .map((f) => (
            <DropdownMenuItem key={f.id} onSelect={() => onMove(f.id)}>
              Mover para {folderPath(folders, f.id).join(' / ')}
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash width={14} height={14} />
          Apagar nota
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
