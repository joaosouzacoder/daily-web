import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

function resolveDbPath(): string {
  return process.env.DAILY_WEB_DB_PATH ?? path.join(process.cwd(), 'data', 'daily-web.db');
}

let db: Database.Database | null = null;
let dbPath: string | null = null;

// Schema base. Idempotente: vale tanto para um banco novo quanto para um que
// já existia antes das migrações numeradas abaixo.
const BASE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS notifications_read (
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    read_at TEXT NOT NULL,
    PRIMARY KEY (source, external_id)
  );

  CREATE TABLE IF NOT EXISTS email_bodies (
    account TEXT NOT NULL,
    message_id TEXT NOT NULL,
    body TEXT NOT NULL,
    cached_at TEXT NOT NULL,
    PRIMARY KEY (account, message_id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`;

// SQLite não altera chave primária com ALTER TABLE, então acrescentar user_id
// à PK exige reconstruir a tabela. As linhas que já existiam são do dono da
// instalação — o primeiro admin — e vão para ele em vez de serem descartadas.
function addUserScope(instance: Database.Database): void {
  const owner =
    (instance.prepare('SELECT id FROM users WHERE is_admin = 1 ORDER BY created_at').get() as
      | { id: string }
      | undefined)?.id ?? null;

  instance.exec(`
    CREATE TABLE email_bodies_new (
      user_id TEXT NOT NULL,
      account TEXT NOT NULL,
      message_id TEXT NOT NULL,
      body TEXT NOT NULL,
      cached_at TEXT NOT NULL,
      PRIMARY KEY (user_id, account, message_id)
    );
    CREATE TABLE notifications_read_new (
      user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (user_id, source, external_id)
    );
  `);

  if (owner) {
    instance
      .prepare(
        `INSERT INTO email_bodies_new (user_id, account, message_id, body, cached_at)
         SELECT ?, account, message_id, body, cached_at FROM email_bodies`,
      )
      .run(owner);
    instance
      .prepare(
        `INSERT INTO notifications_read_new (user_id, source, external_id, read_at)
         SELECT ?, source, external_id, read_at FROM notifications_read`,
      )
      .run(owner);
  }

  instance.exec(`
    DROP TABLE email_bodies;
    DROP TABLE notifications_read;
    ALTER TABLE email_bodies_new RENAME TO email_bodies;
    ALTER TABLE notifications_read_new RENAME TO notifications_read;

    CREATE TABLE IF NOT EXISTS credentials (
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, provider)
    );
  `);
}

// Migrações numeradas, aplicadas em ordem a partir do `user_version` do banco.
// Cada uma roda no máximo uma vez, em transação.
const MIGRATIONS: ((instance: Database.Database) => void)[] = [addUserScope];

function migrate(instance: Database.Database): void {
  const current = instance.pragma('user_version', { simple: true }) as number;
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    instance.transaction(() => {
      MIGRATIONS[version](instance);
      instance.pragma(`user_version = ${version + 1}`);
    })();
  }
}

export function getDb(): Database.Database {
  const currentPath = resolveDbPath();
  if (db && dbPath === currentPath) return db;

  fs.mkdirSync(path.dirname(currentPath), { recursive: true });
  db = new Database(currentPath);
  dbPath = currentPath;
  db.pragma('journal_mode = WAL');
  db.exec(BASE_SCHEMA);
  migrate(db);
  return db;
}
