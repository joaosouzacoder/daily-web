export function parsePulls(raw: string): string[] {
  const lines = raw.split('\n').map((l) => l.replace(/\s+$/, ''));
  const start = lines.findIndex((l) => l.trim().length > 0);
  if (start === -1) return [];
  let end = lines.length - 1;
  while (end >= 0 && lines[end].trim().length === 0) end -= 1;
  return lines.slice(start, end + 1);
}
