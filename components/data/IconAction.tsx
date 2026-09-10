'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props extends Omit<ComponentProps<typeof Button>, 'size' | 'children' | 'aria-label'> {
  /** The words the button no longer shows. Required: it becomes the accessible
   *  name and the tooltip, and an icon nobody can name is a guess, not a button. */
  label: string;
  icon: ReactNode;
  size?: 'icon-xs' | 'icon-sm' | 'icon' | 'icon-lg';
  /** Rendered inside the button, so it stays part of the visible text — a count
   *  is information, not decoration. */
  badge?: ReactNode;
}

/**
 * A button that shows only its glyph. Dropping the label is a space decision, and
 * it must not become a meaning decision: this keeps the words in the tooltip and
 * in the accessible name, so pointer, keyboard and screen reader all still get
 * them.
 */
export function IconAction({
  label,
  icon,
  badge,
  size = 'icon-sm',
  variant = 'ghost',
  className,
  ...props
}: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={badge ? undefined : size}
          aria-label={label}
          className={cn(badge && 'h-8 gap-1.5 px-2.5', className)}
          {...props}
        >
          {icon}
          {badge}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
