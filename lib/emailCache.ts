import { getDb } from './db';
import { fetchBody } from './cli/himalaya';
import type { Account, EmailEnvelope } from './types';

// Buscar o corpo no IMAP na hora do clique custa segundos. O refresher vai
// guardando os corpos conforme os e-mails chegam, então abrir é instantâneo.
const RETENTION_DAYS = 30;

export function getCachedBody(account: Account, messageId: string): string | null {
  const row = getDb()
    .prepare('SELECT body FROM email_bodies WHERE account = ? AND message_id = ?')
    .get(account, messageId) as { body: string } | undefined;
  return row?.body ?? null;
}

export function putCachedBody(account: Account, messageId: string, body: string): void {
  getDb()
    .prepare(
      `INSERT INTO email_bodies (account, message_id, body, cached_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (account, message_id) DO UPDATE SET body = excluded.body, cached_at = excluded.cached_at`,
    )
    .run(account, messageId, body, new Date().toISOString());
}

export function pruneOldBodies(now: Date = new Date()): number {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const result = getDb()
    .prepare('DELETE FROM email_bodies WHERE cached_at < ?')
    .run(cutoff.toISOString());
  return result.changes;
}

export function isCached(account: Account, messageId: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 AS present FROM email_bodies WHERE account = ? AND message_id = ?')
    .get(account, messageId) as { present: number } | undefined;
  return row !== undefined;
}

// Roda em segundo plano depois de cada refresh: só busca o que ainda não
// está em cache, um de cada vez, para não abrir dezenas de conexões IMAP.
export async function warmBodyCache(envelopes: EmailEnvelope[]): Promise<number> {
  let fetched = 0;
  for (const envelope of envelopes) {
    if (isCached(envelope.account, envelope.id)) continue;
    try {
      const body = await fetchBody(envelope.account, envelope.id);
      putCachedBody(envelope.account, envelope.id, body);
      fetched += 1;
    } catch {
      // Um e-mail que falhou não pode interromper o aquecimento dos outros;
      // ele será tentado de novo no próximo ciclo.
    }
  }
  return fetched;
}
