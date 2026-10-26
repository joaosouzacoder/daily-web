import type { ReactNode } from 'react';
import type { PinColor, PinShape } from '@/lib/taskBoard';

/**
 * The pin as a drawing, not a photo: one flat colour per shape and an ink
 * outline, with no light, gloss or shading. Each shape is drawn upright and
 * tilted onto its needle tip, so all of them pierce the paper at the same
 * point. Colour comes from `--pin`, set per `data-pin` in globals.css.
 */
const SHAPES: Record<PinShape, { tilt: number; parts: ReactNode }> = {
  classic: {
    tilt: 22,
    parts: (
      <>
        <path className="postit-pin-needle" d="M20 27 L20 41" />
        <rect x="11.5" y="22" width="17" height="5" rx="2.5" />
        <path d="M15 12.5 L25 12.5 L23.5 22 L16.5 22 Z" />
        <rect x="10" y="4" width="20" height="9" rx="4.5" />
      </>
    ),
  },
  ball: {
    tilt: 18,
    parts: (
      <>
        <path className="postit-pin-needle" d="M20 20 L20 41" />
        <circle cx="20" cy="12.5" r="9.5" />
      </>
    ),
  },
  heart: {
    tilt: 16,
    parts: (
      <>
        <path className="postit-pin-needle" d="M20 21 L20 41" />
        <path d="M20 23 C 8.5 15.5, 8 5.5, 14.3 4.8 C 17.5 4.4, 19.4 6.8, 20 9 C 20.6 6.8, 22.5 4.4, 25.7 4.8 C 32 5.5, 31.5 15.5, 20 23 Z" />
      </>
    ),
  },
};

export function PushPin({
  color,
  shape,
  className = 'postit-pin',
}: {
  color: PinColor;
  shape: PinShape;
  className?: string;
}) {
  const { tilt, parts } = SHAPES[shape];
  return (
    <svg className={className} data-pin={color} data-shape={shape} viewBox="0 0 40 48" aria-hidden="true" focusable="false">
      <g className="postit-pin-body" transform={`rotate(${tilt} 20 41)`}>
        {parts}
      </g>
    </svg>
  );
}
