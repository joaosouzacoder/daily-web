'use client';

import type { ReactNode } from 'react';

export function Chip({
  active = false,
  onClick,
  children,
  // Um chip que dispara requisição precisa poder se travar enquanto ela corre,
  // senão dois cliques seguidos viram duas gravações concorrentes.
  disabled = false,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`chip${active ? ' chip-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
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
