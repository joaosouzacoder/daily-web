export function parsePulls(raw: string): string[] {
  const lines = raw.split('\n').map((l) => l.replace(/\s+$/, ''));
  const start = lines.findIndex((l) => l.trim().length > 0);
  if (start === -1) return [];
  let end = lines.length - 1;
  while (end >= 0 && lines[end].trim().length === 0) end -= 1;
  return lines.slice(start, end + 1);
}

export interface GhpendingConfig {
  user?: string;
  repos: string[];
}

export function parseGhpendingConfig(text: string): GhpendingConfig {
  const userMatch = /^user\s*=\s*"([^"]*)"/m.exec(text);
  const reposMatch = /^repos\s*=\s*\[([^\]]*)\]/m.exec(text);
  const repos = reposMatch
    ? reposMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/^"|"$/g, ''))
        .filter((s) => s.length > 0)
    : [];
  return userMatch ? { user: userMatch[1], repos } : { repos };
}

export function serializeGhpendingConfig(cfg: GhpendingConfig): string {
  const lines: string[] = [];
  if (cfg.user) lines.push(`user = "${cfg.user}"`);
  lines.push(`repos = [${cfg.repos.map((r) => `"${r}"`).join(', ')}]`);
  return lines.join('\n') + '\n';
}
