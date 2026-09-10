'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { focusRing } from '@/lib/theme';

/**
 * A filter toggle. Lit uses the neutral control rim rather than the accent rim: a
 * chip that is on is a control, not an action, and the accent rim would tint it.
 */
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
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors duration-100 ease-brand motion-reduce:transition-none',
        'disabled:pointer-events-none disabled:opacity-50',
        focusRing,
        active
          ? 'border-brand-edge bg-brand-tint text-ink shadow-control'
          : 'border-line-strong bg-surface-2 text-ink-mid shadow-e1 hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {children}
    </button>
  );
}
