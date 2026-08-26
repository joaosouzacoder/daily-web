import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

let dir: string;
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-cred-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  process.env.DAILY_WEB_SECRET_KEY = randomBytes(32).toString('base64');
  vi.resetModules();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  process.env = { ...ORIGINAL_ENV };
});

describe('credenciais por usuário', () => {
  it('guarda e devolve os valores', async () => {
    const { setCredential, getCredential } = await import('@/lib/vault/credentials');
    setCredential('u-1', 'jira', { cloud: 'acme', email: 'a@b.c', token: 'segredo' });
    expect(getCredential('u-1', 'jira')).toEqual({ cloud: 'acme', email: 'a@b.c', token: 'segredo' });
  });

  it('não confunde credenciais de usuários diferentes', async () => {
    const { setCredential, getCredential } = await import('@/lib/vault/credentials');
    setCredential('u-1', 'github', { token: 'do-joao' });
    setCredential('u-2', 'github', { token: 'da-maria' });
    expect(getCredential('u-1', 'github')?.token).toBe('do-joao');
    expect(getCredential('u-2', 'github')?.token).toBe('da-maria');
  });

  it('devolve null quando não há credencial', async () => {
    const { getCredential } = await import('@/lib/vault/credentials');
    expect(getCredential('u-1', 'jira')).toBeNull();
  });

  it('sobrescreve em vez de duplicar', async () => {
    const { setCredential, getCredential } = await import('@/lib/vault/credentials');
    setCredential('u-1', 'github', { token: 'velho' });
    setCredential('u-1', 'github', { token: 'novo' });
    expect(getCredential('u-1', 'github')?.token).toBe('novo');
  });

  it('remove', async () => {
    const { setCredential, deleteCredential, getCredential } = await import('@/lib/vault/credentials');
    setCredential('u-1', 'github', { token: 'x' });
    expect(deleteCredential('u-1', 'github')).toBe(true);
    expect(getCredential('u-1', 'github')).toBeNull();
  });

  // O que está no banco tem que ser ilegível a olho nu: quem abrir o SQLite
  // não pode achar o token ali.
  it('o segredo não aparece em claro no banco', async () => {
    const { setCredential } = await import('@/lib/vault/credentials');
    const { getDb } = await import('@/lib/db');
    setCredential('u-1', 'github', { token: 'ghp_super_secreto' });
    const row = getDb().prepare('SELECT ciphertext FROM credentials').get() as { ciphertext: string };
    expect(row.ciphertext).not.toContain('ghp_super_secreto');
  });
});

describe('status para a tela', () => {
  it('reporta não configurado quando não há credencial', async () => {
    const { credentialStatus } = await import('@/lib/vault/credentials');
    expect(credentialStatus('u-1', 'jira')).toMatchObject({ configured: false, updatedAt: null, visible: {} });
  });

  // A tela precisa mostrar "qual domínio Jira está ali", mas nunca o token.
  it('expõe campos não secretos e omite os secretos', async () => {
    const { setCredential, credentialStatus } = await import('@/lib/vault/credentials');
    setCredential('u-1', 'jira', { cloud: 'acme', email: 'a@b.c', token: 'segredo' });
    const status = credentialStatus('u-1', 'jira');
    expect(status.configured).toBe(true);
    expect(status.visible).toEqual({ cloud: 'acme', email: 'a@b.c' });
    expect(JSON.stringify(status)).not.toContain('segredo');
  });

  // Se a chave do cofre for trocada, a listagem inteira não pode quebrar.
  it('credencial ilegível continua listada como configurada, sem campos', async () => {
    const { setCredential } = await import('@/lib/vault/credentials');
    setCredential('u-1', 'jira', { cloud: 'acme', token: 'segredo' });
    process.env.DAILY_WEB_SECRET_KEY = randomBytes(32).toString('base64');
    vi.resetModules();
    const { credentialStatus } = await import('@/lib/vault/credentials');
    const status = credentialStatus('u-1', 'jira');
    expect(status.configured).toBe(true);
    expect(status.visible).toEqual({});
  });

  it('allStatuses cobre todos os provedores', async () => {
    const { allStatuses, PROVIDERS } = await import('@/lib/vault/credentials');
    expect(allStatuses('u-1').map((s) => s.provider)).toEqual(PROVIDERS);
  });
});
