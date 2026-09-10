import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

const TONE: Record<StatusTone, string> = {
  neutral: 'border-line-strong bg-neutral-tint text-ink-dim',
  success: 'border-success/40 bg-success-tint text-success',
  warning: 'border-warning/45 bg-warning-tint text-warning',
  destructive: 'border-danger/40 bg-danger-tint text-danger',
  info: 'border-info/40 bg-info-tint text-info',
};

/**
 * Literal Unicode inside an aria-hidden span, never an icon component: an icon
 * changes the pill's baseline alignment and its gap rhythm.
 */
export const GLYPH = {
  /** active, sent, live */
  live: '●',
  /** inactive, pending, ended */
  idle: '○',
  /** in flight */
  moving: '◐',
  /** error */
  alert: '▲',
} as const;

interface PillProps {
  label: ReactNode;
  glyph: string;
  tone: StatusTone;
  /** A secondary qualifier, rendered outside the pill so it cannot compete with
   *  the label that actually carries the state. */
  note?: ReactNode;
  className?: string;
}

/** The shape carries the state alongside the colour, so the reading survives
 *  colour blindness and a grayscale print. */
export function StatusPill({ label, glyph, tone, note, className }: PillProps) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span
        className={cn(
          'type-caption inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5',
          TONE[tone],
          className,
        )}
      >
        <span aria-hidden>{glyph}</span>
        {label}
      </span>
      {note && <span className="text-xs text-ink-dim">{note}</span>}
    </span>
  );
}

const DOT: Record<StatusTone, string> = {
  neutral: 'bg-ink-dim',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-danger',
  info: 'bg-info',
};

/** Where a pill is too heavy for a dense list. The dot is decorative; the
 *  translated word beside it carries the meaning. */
export function StatusDot({ tone, className }: { tone: StatusTone; className?: string }) {
  return <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[tone], className)} />;
}
