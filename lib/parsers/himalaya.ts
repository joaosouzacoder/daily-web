import type { Account, EmailEnvelope } from '@/lib/types';

interface RawAddr {
  name?: string | null;
  addr?: string | null;
}

interface RawEnvelope {
  id: string;
  flags?: string[] | null;
  subject?: string | null;
  from?: RawAddr | null;
  date?: string | null;
}

export function parseEnvelopes(json: string, account: Account): EmailEnvelope[] {
  const raw: RawEnvelope[] = JSON.parse(json);
  return raw.map((env) => {
    const flags = env.flags ?? [];
    const from = env.from ?? {};
    const name = from.name ?? '';
    const addr = from.addr ?? '';
    return {
      id: env.id,
      account,
      from: name.trim() ? name : addr,
      subject: env.subject ?? '',
      unread: !flags.some((f) => f.toLowerCase() === 'seen'),
      date: env.date ?? '',
    };
  });
}

function parseDate(raw: string): number {
  const t = Date.parse(raw.replace(' ', 'T'));
  return Number.isNaN(t) ? -Infinity : t;
}

export function sortRecentFirst(items: EmailEnvelope[]): EmailEnvelope[] {
  return [...items].sort((a, b) => parseDate(b.date) - parseDate(a.date));
}

export function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)));
}

function collapseBlankLines(raw: string): string {
  return raw
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeHtml(raw: string): boolean {
  return /<\s*(html|body|table|div|p|br)\b/i.test(raw);
}

const BLOCK_TAGS_RE = /<\/?(p|br|div|tr|td|th|li|h[1-6]|table|ul|ol)\b[^>]*>/gi;

export function readable(raw: string): string {
  if (!looksLikeHtml(raw)) {
    return collapseBlankLines(raw);
  }
  const withoutScripts = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const withoutHidden = withoutScripts.replace(/<([a-z][a-z0-9]*)\b[^>]*\bstyle\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, '');
  const withBreaks = withoutHidden.replace(BLOCK_TAGS_RE, '\n');
  const withoutTags = withBreaks.replace(/<[^>]+>/g, '');
  return collapseBlankLines(decodeEntities(withoutTags));
}

export function parseMessageId(raw: string): string | null {
  for (const line of raw.split('\n')) {
    const match = /^(message-id):\s*(.+)$/i.exec(line.trim());
    if (match) {
      const value = match[2].trim().replace(/^</, '').replace(/>$/, '');
      return value || null;
    }
  }
  return null;
}

const FOLDER_ALIASES = ['inbox', 'sent', 'drafts', 'trash', 'spam', 'all'];

export function sortFolders(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const rankA = FOLDER_ALIASES.indexOf(a.toLowerCase());
    const rankB = FOLDER_ALIASES.indexOf(b.toLowerCase());
    const ra = rankA === -1 ? FOLDER_ALIASES.length : rankA;
    const rb = rankB === -1 ? FOLDER_ALIASES.length : rankB;
    if (ra !== rb) return ra - rb;
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
}
