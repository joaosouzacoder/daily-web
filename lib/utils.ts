import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge has to be told about the custom groups, or a className
 * override resolves by stylesheet order instead of argument order — the caller
 * passing `type-caption` would silently lose to a primitive's own size.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ type: ['display', 'title', 'heading', 'subhead', 'body', 'data', 'caption'] }],
      shadow: [{ shadow: ['e1', 'e2', 'e3', 'e4', 'e5', 'glow', 'button', 'control'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
