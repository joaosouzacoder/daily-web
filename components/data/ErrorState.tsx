'use client';

import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  title: string;
  description?: string;
  onRetry?: () => void;
}

/**
 * A failed fetch renders a card inside the page chrome, never a boundary that
 * blows away the navigation. Says what failed and offers to try again.
 *
 * Retry is `outline`, never a destructive-coloured button: retrying is not the
 * dangerous act.
 */
export function ErrorState({ title, description, onRetry }: Props) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 py-16 text-center"
    >
      <CircleAlert className="size-8 text-destructive" />
      <div className="grid gap-1">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}
