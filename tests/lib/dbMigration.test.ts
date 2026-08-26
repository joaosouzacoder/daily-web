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

// Uma credencial como ela era guardada entre o estágio 2 e o multiusuário
// completo: uma linha por provedor.
function seedLegacyCredential(userId: string, provider: string, ciphertext: string): void {
  const legacy = new Database(dbFile);
  legacy.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      user_id TEXT NOT NULL, provider TEXT NOT NULL, ciphertext TEXT NOT NULL,
      updated_at TEXT NOT NULL, PRIMARY KEY (user_id, provider)
    );
  `);
  legacy
    .prepare('INSERT INTO credentials VALUES (?,?,?,?)')
    .run(userId, provider, ciphertext, '2026-01-02');
  legacy.close();
}

describe('migração para escopo por usuário', () => {
  it('preserva as notificações lidas, atribuindo ao primeiro admin', async () => {
    const owner = seedLegacyDatabase();
    const { getDb } = await import('@/lib/db');

    const read = getDb()
      .prepare('SELECT user_id, external_id FROM notifications_read')
      .get() as { user_id: string };
    expect(read.user_id).toBe(owner);
  });

  // As caixas deixaram de ser 'work'/'personal' e viraram conexões com id
  // próprio: um corpo indexado pelo nome antigo não pertence a conexão
  // nenhuma. Descartar é mais barato do que adivinhar — o cache se refaz no
  // primeiro ciclo do refresher.
  it('descarta o cache de e-mail preso aos nomes de conta antigos', async () => {
    seedLegacyDatabase();
    const { getDb } = await import('@/lib/db');
    const count = getDb().prepare('SELECT count(*) c FROM email_bodies').get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('cria as tabelas de conexões e de módulos', async () => {
    seedLegacyDatabase();
    const { getDb } = await import('@/lib/db');
    const conn = getDb().prepare('PRAGMA table_info(connections)').all() as { name: string }[];
    expect(conn.map((c) => c.name)).toEqual([
      'id',
      'user_id',
      'module',
      'label',
      'ciphertext',
      'created_at',
      'updated_at',
    ]);
    const mods = getDb().prepare('PRAGMA table_info(module_settings)').all() as { name: string }[];
    expect(mods.map((c) => c.name)).toEqual(['user_id', 'module', 'enabled', 'updated_at']);
  });

  it('leva a credencial antiga para a conexão do módulo correspondente', async () => {
    const owner = seedLegacyDatabase();
    seedLegacyCredential(owner, 'github', 'cifrado-github');

    const { getDb } = await import('@/lib/db');
    const row = getDb()
      .prepare('SELECT module, ciphertext FROM connections WHERE user_id = ?')
      .get(owner) as { module: string; ciphertext: string };
    // O ciphertext é copiado sem ser aberto: a migração roda na subida,
    // quando a chave pode nem estar no ambiente.
    expect(row).toEqual({ module: 'pulls', ciphertext: 'cifrado-github' });
  });

  it('roda uma vez só — reabrir não duplica nem apaga dados', async () => {
    const owner = seedLegacyDatabase();
    seedLegacyCredential(owner, 'jira', 'cifrado-jira');
    const { getDb } = await import('@/lib/db');
    const version = getDb().pragma('user_version', { simple: true });

    vi.resetModules();
    const again = await import('@/lib/db');
    const db = again.getDb();
    expect(db.pragma('user_version', { simple: true })).toBe(version);
    expect((db.prepare('SELECT count(*) c FROM connections').get() as { c: number }).c).toBe(1);
    expect((db.prepare('SELECT count(*) c FROM notifications_read').get() as { c: number }).c).toBe(1);
  });

  it('banco novo já nasce migrado', async () => {
    const { getDb } = await import('@/lib/db');
    const cols = getDb().prepare('PRAGMA table_info(email_bodies)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('user_id');
  });
});
