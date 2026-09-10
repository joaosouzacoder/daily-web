'use client';

import { X } from 'lucide-react';
import type { ActiveFilter } from '@/lib/filters';
import { Badge } from './badge';
import { Button } from './button';

interface Props {
  filters: ActiveFilter[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

export function ActiveFilters({ filters, onRemove, onClearAll }: Props) {
  if (filters.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 pb-3">
      {filters.map((f) => (
        <Badge key={f.id} variant="secondary" className="type-caption gap-1 pr-1">
          {f.label}
          <button
            type="button"
            aria-label={`remover filtro ${f.label}`}
            onClick={() => onRemove(f.id)}
            className="rounded-full p-0.5 text-ink-dim transition-colors hover:text-danger motion-reduce:transition-none"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {filters.length > 1 && (
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={onClearAll}>
          <X className="size-3.5" />
          Limpar tudo
        </Button>
      )}
    </div>
  );
}
