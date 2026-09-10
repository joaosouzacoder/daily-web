/** The em dash a missing value renders as. Never blank, and never zero. */
export const EM_DASH = '—';

/** Built against the app's own locale rather than a hard-coded one. */
const LOCALE = 'pt-BR';

export function formatDate(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return EM_DASH;
  return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

export function formatTime(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return EM_DASH;
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatCurrency(cents: number | null | undefined, currency = 'BRL'): string {
  if (cents == null || !Number.isFinite(cents)) return EM_DASH;
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(cents / 100);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  return new Intl.NumberFormat(LOCALE).format(value);
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.348],
  ['month', 12],
  ['year', Infinity],
];

export function formatRelative(value: Date | string | null | undefined, now = new Date()): string {
  const d = toDate(value);
  if (!d) return EM_DASH;
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  let delta = (d.getTime() - now.getTime()) / 1000;
  for (const [unit, span] of RELATIVE_STEPS) {
    if (Math.abs(delta) < span) return rtf.format(Math.round(delta), unit);
    delta /= span;
  }
  return rtf.format(Math.round(delta), 'year');
}

/** "1 items" in a selector is what makes a screen look careless. */
export function count(n: number, singular: string, plural: string, zero?: string): string {
  if (n === 0 && zero) return zero;
  return `${new Intl.NumberFormat(LOCALE).format(n)} ${n === 1 ? singular : plural}`;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
