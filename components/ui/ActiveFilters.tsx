'use client';

import type { ActiveFilter } from '@/lib/filters';
import { RemovableChip } from './Chip';

interface Props {
  filters: ActiveFilter[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

export function ActiveFilters({ filters, onRemove, onClearAll }: Props) {
  if (filters.length === 0) return null;
  return (
    <div className="active-filters">
      {filters.map((f) => (
        <RemovableChip key={f.id} label={f.label} onRemove={() => onRemove(f.id)} />
      ))}
      {filters.length > 1 && (
        <button type="button" className="btn btn-ghost" onClick={onClearAll}>
          Limpar tudo
        </button>
      )}
    </div>
  );
}
