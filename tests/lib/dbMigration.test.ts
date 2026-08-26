import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

let dir: string;
let dbFile: string;
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-migrate-'));
  dbFile = path.join(dir, 'test.db');
  process.env.DAILY_WEB_DB_PATH = dbFile;
  vi.resetModules();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  process.env = { ...ORIGINAL_ENV };
});

// Simula o banco como ele existia antes do multiusuário.
function seedLegacyDatabase(): string {
  const legacy = new Database(dbFile);
  legacy.exec(`
    CREATE TABLE notifications_read (
      source TEXT NOT NULL, external_id TEXT NOT NULL, read_at TEXT NOT NULL,
      PRIMARY KEY (source, external_id)
    );
    CREATE TABLE email_bodies (
      account TEXT NOT NULL, message_id TEXT NOT NULL, body TEXT NOT NULL, cached_at TEXT NOT NULL,
      PRIMARY KEY (account, message_id)
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
  `);
  legacy.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('u-joao', 'joao', 'hash', 1, '2026-01-01');
  legacy.prepare('INSERT INTO email_bodies VALUES (?,?,?,?)').run('work', '42', 'corpo antigo', '2026-01-01');
  legacy.prepare('INSERT INTO notifications_read VALUES (?,?,?)').run('jira_mention', 'X-1', '2026-01-01');
  legacy.close();
  return 'u-joao';
}

describe('migração para escopo por usuário', () => {
  it('preserva o cache e as notificações lidas, atribuindo ao primeiro admin', async () => {
    const owner = seedLegacyDatabase();
    const { getDb } = await import('@/lib/db');
    const db = getDb();

    const body = db.prepare('SELECT user_id, body FROM email_bodies').get() as { user_id: string; body: string };
    expect(body).toEqual({ user_id: owner, body: 'corpo antigo' });

    const read = db.prepare('SELECT user_id, external_id FROM notifications_read').get() as { user_id: string };
    expect(read.user_id).toBe(owner);
  });

  it('cria a tabela de credenciais', async () => {
    seedLegacyDatabase();
    const { getDb } = await import('@/lib/db');
    const cols = getDb().prepare('PRAGMA table_info(credentials)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual(['user_id', 'provider', 'ciphertext', 'updated_at']);
  });

  it('roda uma vez só — reabrir não duplica nem apaga dados', async () => {
    seedLegacyDatabase();
    const { getDb } = await import('@/lib/db');
    getDb();
    const version = getDb().pragma('user_version', { simple: true });

    vi.resetModules();
    const again = await import('@/lib/db');
    const db = again.getDb();
    expect(db.pragma('user_version', { simple: true })).toBe(version);
    expect((db.prepare('SELECT count(*) c FROM email_bodies').get() as { c: number }).c).toBe(1);
  });

  it('banco novo já nasce migrado', async () => {
    const { getDb } = await import('@/lib/db');
    const cols = getDb().prepare('PRAGMA table_info(email_bodies)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('user_id');
  });
});
