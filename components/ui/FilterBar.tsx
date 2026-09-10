'use client';

import type { ReactNode } from 'react';

/**
 * Controls float on the background; a card is for content. In a shell, two short
 * fields inside a card become a nearly empty rectangle bigger than the fields.
 *
 * Every control inside is h-8, the gap is 2, and the row wraps rather than
 * collapsing into a sheet — at 375px two wrapped rows read better than a modal
 * that hides what is filtering the list behind it.
 */
export function FilterBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="search" aria-label={label} className="flex flex-wrap items-center gap-2 pb-3">
      {children}
    </div>
  );
}
