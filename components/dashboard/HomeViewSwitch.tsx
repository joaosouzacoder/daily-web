'use client';

import { LayoutGrid, LayoutPanelLeft } from 'lucide-react';
import { segmentedGroup, segmentedItem } from '@/components/tasks/segmented';
import { focusRing } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { HomeView } from '@/lib/types';

interface Props {
  view: HomeView;
  onChange: (view: HomeView) => void;
}

/** Picks how the home page arranges the panels: the grid, or tabs. */
export function HomeViewSwitch({ view, onChange }: Props) {
  return (
    <div role="group" aria-label="Disposição do Início" className={segmentedGroup}>
      <button
        type="button"
        className={cn(segmentedItem, focusRing)}
        aria-pressed={view === 'grid'}
        onClick={() => onChange('grid')}
      >
        <LayoutGrid className="size-3.5" aria-hidden="true" />
        Grade
      </button>
      <button
        type="button"
        className={cn(segmentedItem, focusRing)}
        aria-pressed={view === 'workspace'}
        onClick={() => onChange('workspace')}
      >
        <LayoutPanelLeft className="size-3.5" aria-hidden="true" />
        Abas
      </button>
    </div>
  );
}
