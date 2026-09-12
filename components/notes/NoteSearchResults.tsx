'use client';

import { FileText } from 'lucide-react';
import { focusRing } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { NoteSearchResult } from '@/lib/notesSearch';

interface Props {
  results: NoteSearchResult[];
  activeNoteId: string | null;
  onOpen: (id: string) => void;
}

export function NoteSearchResults({ results, activeNoteId, onOpen }: Props) {
  if (results.length === 0) {
    return (
      <p className="px-2 py-3 type-caption text-ink-dim" role="status">
        Nenhuma nota encontrada.
      </p>
    );
  }

  return (
    <ul aria-label="resultados da busca" className="flex flex-col gap-0.5">
      {results.map((result) => (
        <li key={result.note.id} className="list-none">
          <button
            type="button"
            aria-current={result.note.id === activeNoteId}
            onClick={() => onOpen(result.note.id)}
            className={cn(
              'flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors duration-100 ease-brand motion-reduce:transition-none',
              result.note.id === activeNoteId
                ? 'bg-brand-tint text-ink'
                : 'hover:bg-glass-line text-ink-mid',
              focusRing,
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-sm">
              <FileText className="size-3.5 shrink-0 text-ink-dim" aria-hidden />
              <span className="truncate">{result.note.title || 'sem título'}</span>
            </span>
            {result.snippet && (
              <span className="line-clamp-2 type-caption text-ink-dim">{result.snippet}</span>
            )}
            <span className="type-caption text-ink-dim">
              {result.path.length > 0 ? result.path.join(' / ') : 'Sem pasta'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
