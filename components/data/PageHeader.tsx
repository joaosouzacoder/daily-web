import type { ReactNode } from 'react';
import { tabular } from '@/lib/theme';

interface Props {
  title: ReactNode;
  count?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

/**
 * basis-80 is a real fix, not decoration: with the default basis:auto a long
 * description claims its max-content width and bumps the primary action onto a
 * second row.
 */
export function PageHeader({ title, count, description, action }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pb-3">
      <div className="grid min-w-0 flex-1 basis-80 gap-1.5">
        <div className="flex items-baseline gap-2.5">
          <h1 className="type-heading">{title}</h1>
          {count !== undefined && (
            <span className={`text-sm text-ink-dim ${tabular}`}>{count}</span>
          )}
        </div>
        {description && <p className="max-w-prose text-sm text-ink-mid">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
