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

// Uma credencial por provedor não comporta duas caixas de e-mail nem duas
// agendas. `connections` guarda N conexões por módulo, cada uma com rótulo
// próprio. O ciphertext das credenciais antigas é copiado sem ser aberto: a
// migração roda na subida, quando DAILY_WEB_SECRET_KEY pode nem estar no env.
const CREDENTIAL_TO_MODULE: Record<string, string> = {
  jira: 'jira',
  github: 'pulls',
  mstodo: 'tasks',
};

function addConnections(instance: Database.Database): void {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      module TEXT NOT NULL,
      label TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_connections_user_module
      ON connections (user_id, module);

    CREATE TABLE IF NOT EXISTS module_settings (
      user_id TEXT NOT NULL,
      module TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, module)
    );
  `);

  const hasCredentials = instance
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'credentials'`)
    .get();
  if (!hasCredentials) return;

  const rows = instance
    .prepare('SELECT user_id, provider, ciphertext, updated_at FROM credentials')
    .all() as { user_id: string; provider: string; ciphertext: string; updated_at: string }[];

  const insert = instance.prepare(
    `INSERT INTO connections (id, user_id, module, label, ciphertext, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of rows) {
    const moduleId = CREDENTIAL_TO_MODULE[row.provider];
    if (!moduleId) continue;
    insert.run(
      `${row.user_id}:${moduleId}`,
      row.user_id,
      moduleId,
      moduleId,
      row.ciphertext,
      row.updated_at,
      row.updated_at,
    );
  }
}

// As caixas de e-mail deixam de ser 'work'/'personal' fixos e passam a ser
// conexões com id próprio. Os corpos em cache estão indexados pelo nome
// antigo, que não corresponde a conexão nenhuma: descartar é mais barato e
// mais correto do que adivinhar um dono — o cache se reconstrói sozinho.
function dropLegacyEmailCache(instance: Database.Database): void {
  instance.exec('DELETE FROM email_bodies');
}

// Tarefas guardadas na própria app. É o provedor padrão: quem clona o repo
// não tem a CLI mstodo, e um dashboard cujo painel principal exige instalar
// uma ferramenta externa não serve para quem está começando.
function addLocalTasks(instance: Database.Database): void {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      due TEXT NOT NULL DEFAULT '',
      time TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'normal',
      recur TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks (user_id, position);

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks (task_id, position);
  `);
}

// Preferências de visualização, por usuário. Diferente de `module_settings`,
// que liga e desliga um módulo: aqui fica o como, não o se — por enquanto
// quantos dias a agenda mostra. Chave-valor porque cada preferência nova não
// deve custar uma migração.
function addPreferences(instance: Database.Database): void {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS preferences (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );
  `);
}

// Migrações numeradas, aplicadas em ordem a partir do `user_version` do banco.
// Cada uma roda no máximo uma vez, em transação.
const MIGRATIONS: ((instance: Database.Database) => void)[] = [
  addUserScope,
  addConnections,
  dropLegacyEmailCache,
  addLocalTasks,
  addPreferences,
];

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
