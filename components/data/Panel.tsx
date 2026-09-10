'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Exported so an ad hoc shell needing its own grid does not hand-copy the recipe. */
export const cardSurface =
  'rounded-xl border bg-card shadow-e2 backdrop-blur-xl backdrop-saturate-150';

/**
 * True when an ancestor already draws the card and pins it to a fixed height —
 * the dashboard grid does. A framed Panel must not draw a second surface, and,
 * more importantly, must not let that surface live inside the scroll container:
 * the frame would scroll away with the rows and the module would stop looking
 * like a box at all.
 */
const FramedContext = createContext(false);

export function PanelFrame({ children }: { children: ReactNode }) {
  return <FramedContext.Provider value={true}>{children}</FramedContext.Provider>;
}

interface Props {
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * The standard content container: one block per topic, never one giant card with
 * the whole screen inside it. The cuts between blocks are what say where one topic
 * ends and the next begins.
 *
 * Padding lives once on the section, never `py` on the root plus `px` per slot.
 * Never nest a Panel around a CardContent — that is how you get double padding.
 */
export function Panel({
  id,
  title,
  description,
  action,
  compact = false,
  className,
  children,
}: Props) {
  const framed = useContext(FramedContext);

  const header = (title || action) && (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-4 gap-y-2',
        // In a frame the header is the one part that must not move: it stays put
        // while the rows go under it.
        framed && (compact ? 'shrink-0 px-5 pt-5 pb-2' : 'shrink-0 px-6 pt-6 pb-3'),
      )}
    >
      <div className="grid min-w-0 gap-1">
        {title && (
          <h3 className={compact ? 'type-caption text-ink-dim' : 'type-subhead'}>{title}</h3>
        )}
        {description && <p className="max-w-prose text-sm text-ink-mid">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );

  if (framed) {
    return (
      <section id={id} className={cn('flex h-full min-h-0 flex-col', className)}>
        {header}
        {/* min-h-0 is load-bearing: without it the flex child takes content height
            and the scroll moves back out to the page. */}
        <div
          className={cn(
            'min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]',
            // pt-1 is not spacing, it is clearance: the focus ring reaches 4px
            // past its control, and the first row of this scroller sits flush
            // against the clipping edge. Without it a focused chip or select on
            // that first row gets its ring sliced off along the top.
            compact ? 'px-5 pt-1 pb-5' : 'px-6 pt-1 pb-6',
            !header && (compact ? 'pt-5' : 'pt-6'),
          )}
        >
          {children}
        </div>
      </section>
    );
  }

  return (
    <section
      id={id}
      className={cn(
        cardSurface,
        'flex h-full flex-col',
        compact ? 'gap-3 p-5' : 'gap-5 p-6',
        className,
      )}
    >
      {header}
      {children}
    </section>
  );
}
