import type { Account, EmailEnvelope } from '@/lib/types';

interface RawAddr {
  name?: string | null;
  email?: string | null;
}

interface RawFlag {
  iana?: string | null;
}

interface RawEnvelope {
  id: string;
  flags?: RawFlag[] | null;
  subject?: string | null;
  from?: RawAddr[] | null;
  date?: string | null;
}

interface RawEnvelopeList {
  envelopes?: RawEnvelope[] | null;
}

export function parseEnvelopes(json: string, account: Account): EmailEnvelope[] {
  const parsed: RawEnvelopeList = JSON.parse(json);
  const raw = parsed.envelopes ?? [];
  return raw.map((env) => {
    const flags = env.flags ?? [];
    const from = env.from?.[0] ?? {};
    const name = from.name ?? '';
    const addr = from.email ?? '';
    return {
      id: env.id,
      account,
      from: name.trim() ? name : addr,
      subject: env.subject ?? '',
      unread: !flags.some((f) => f.iana === 'seen'),
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

function stripHiddenElements(html: string): string {
  const openTagWithDisplayNone = /<([a-z][a-z0-9]*)\b[^>]*\bstyle\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>/gi;
  let result = html;
  let match: RegExpExecArray | null;
  while ((match = openTagWithDisplayNone.exec(result))) {
    const tagName = match[1].toLowerCase();
    const startIndex = match.index;
    const openRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
    const closeRe = new RegExp(`</${tagName}>`, 'gi');
    let depth = 1;
    let cursor = openTagWithDisplayNone.lastIndex;
    let endIndex = result.length;
    while (depth > 0) {
      openRe.lastIndex = cursor;
      closeRe.lastIndex = cursor;
      const nextOpen = openRe.exec(result);
      const nextClose = closeRe.exec(result);
      if (!nextClose) {
        endIndex = result.length;
        break;
      }
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth += 1;
        cursor = nextOpen.index + nextOpen[0].length;
      } else {
        depth -= 1;
        cursor = nextClose.index + nextClose[0].length;
        if (depth === 0) endIndex = cursor;
      }
    }
    result = result.slice(0, startIndex) + result.slice(endIndex);
    openTagWithDisplayNone.lastIndex = 0;
  }
  return result;
}

export function readable(raw: string): string {
  if (!looksLikeHtml(raw)) {
    return collapseBlankLines(raw);
  }
  const withoutScripts = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const withoutHidden = stripHiddenElements(withoutScripts);
  const withBreaks = withoutHidden.replace(BLOCK_TAGS_RE, '\n');
  const withoutTags = withBreaks.replace(/<[^>]+>/g, '');
  return collapseBlankLines(decodeEntities(withoutTags));
}

interface RawMessageHeader {
  name?: string | { other?: string } | null;
  value?: { Text?: string | null } | null;
}

interface RawMessagePart {
  headers?: RawMessageHeader[] | null;
}

interface RawMessageRead {
  parts?: RawMessagePart[] | null;
}

export function parseMessageIdFromJson(json: string): string | null {
  const parsed: RawMessageRead = JSON.parse(json);
  for (const part of parsed.parts ?? []) {
    for (const header of part.headers ?? []) {
      if (header.name === 'message_id') {
        return header.value?.Text ?? null;
      }
    }
  }
  return null;
}

export function stripMessageReadHeader(raw: string): string {
  const lines = raw.split('\n');
  const markerIndex = lines.findIndex((l) => /^\[\d+\]\s/.test(l));
  if (markerIndex === -1) return raw;
  const blankIndex = lines.findIndex((l, i) => i > markerIndex && l.trim() === '');
  if (blankIndex === -1) return raw;
  return lines.slice(blankIndex + 1).join('\n');
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
