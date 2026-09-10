import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { tabular } from '@/lib/theme';

interface Props {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  trend?: ReactNode;
  tone?: string;
}

/**
 * A 2px left rule plus a 16px gutter, caption label, value at 20px semibold with
 * tabular figures, delta on the same baseline, context line below.
 */
export function Metric({ label, value, hint, trend, tone }: Props) {
  return (
    <div className="flex flex-col gap-1.5 border-l-2 border-line pl-4">
      <span className="type-caption text-ink-mid">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className={cn('type-subhead', tabular, tone)}>{value}</span>
        {trend}
      </span>
      {hint && <span className="text-sm text-ink-mid">{hint}</span>}
    </div>
  );
}
