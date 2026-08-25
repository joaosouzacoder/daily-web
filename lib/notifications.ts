import { getDb } from './db';
import { fetchMentions } from './cli/jira';
import type { NotificationItem } from '@/lib/types';

export function isRead(source: string, externalId: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM notifications_read WHERE source = ? AND external_id = ?')
    .get(source, externalId);
  return row !== undefined;
}

export function markRead(source: string, externalId: string): void {
  getDb()
    .prepare(
      'INSERT INTO notifications_read (source, external_id, read_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT (source, external_id) DO NOTHING',
    )
    .run(source, externalId, new Date().toISOString());
}

export async function getNotifications(): Promise<NotificationItem[]> {
  const mentions = await fetchMentions();
  return mentions.map((issue) => ({
    id: issue.key,
    source: 'jira_mention' as const,
    title: `${issue.key} — ${issue.summary}`,
    url: issue.url,
    read: isRead('jira_mention', issue.key),
  }));
}
