import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The inline sibling of ErrorState: a partial failure inside a panel that is
 * otherwise showing data, where a full centred block would throw away the rows
 * that did arrive.
 *
 * Warning rather than danger, and it carries a word as well as the hue — a
 * degraded fetch is not the same claim as a destroyed record.
 */
export function PanelError({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="alert"
      className={cn(
        'rounded-sm border border-warning/40 border-l-2 border-l-warning bg-warning-tint px-4 py-3 text-sm leading-relaxed text-ink-mid [overflow-wrap:anywhere]',
        className,
      )}
    >
      {children}
    </p>
  );
}
