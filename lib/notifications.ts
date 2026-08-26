import { getDb } from './db';
import { fetchMentions } from './integrations/jiraApi';
import type { Connection } from './vault/connections';
import type { NotificationItem } from '@/lib/types';

export function isRead(userId: string, source: string, externalId: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM notifications_read WHERE user_id = ? AND source = ? AND external_id = ?')
    .get(userId, source, externalId);
  return row !== undefined;
}

export function markRead(userId: string, source: string, externalId: string): void {
  getDb()
    .prepare(
      'INSERT INTO notifications_read (user_id, source, external_id, read_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT (user_id, source, external_id) DO NOTHING',
    )
    .run(userId, source, externalId, new Date().toISOString());
}

export async function getNotifications(
  userId: string,
  connection: Connection,
): Promise<NotificationItem[]> {
  const mentions = await fetchMentions(connection);
  return mentions.map((issue) => ({
    id: issue.key,
    source: 'jira_mention' as const,
    title: `${issue.key} — ${issue.summary}`,
    url: issue.url,
    read: isRead(userId, 'jira_mention', issue.key),
  }));
}
