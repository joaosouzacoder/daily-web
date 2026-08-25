'use client';

import type { ReactNode } from 'react';

export function Chip({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`chip${active ? ' chip-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="chip chip-removable">
      {label}
      <button type="button" aria-label={`remover filtro ${label}`} onClick={onRemove}>
        ×
      </button>
    </span>
  );
}
