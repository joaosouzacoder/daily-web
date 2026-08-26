import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

function resolveDbPath(): string {
  return process.env.DAILY_WEB_DB_PATH ?? path.join(process.cwd(), 'data', 'daily-web.db');
}

let db: Database.Database | null = null;
let dbPath: string | null = null;

export function getDb(): Database.Database {
  const currentPath = resolveDbPath();
  if (db && dbPath === currentPath) return db;

  fs.mkdirSync(path.dirname(currentPath), { recursive: true });
  db = new Database(currentPath);
  dbPath = currentPath;
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications_read (
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (source, external_id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_bodies (
      account TEXT NOT NULL,
      message_id TEXT NOT NULL,
      body TEXT NOT NULL,
      cached_at TEXT NOT NULL,
      PRIMARY KEY (account, message_id)
    );
  `);
  return db;
}
