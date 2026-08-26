import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { randomBytes } from 'node:crypto';

const ORIGINAL_ENV = { ...process.env };
const KEY = randomBytes(32).toString('base64');

beforeEach(() => {
  process.env.DAILY_WEB_SECRET_KEY = KEY;
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('cofre de credenciais', () => {
  it('decifra o que cifrou', async () => {
    const { encrypt, decrypt } = await import('@/lib/vault/crypto');
    expect(decrypt(encrypt('token-secreto'))).toBe('token-secreto');
  });

  it('preserva acentos e caracteres fora do ASCII', async () => {
    const { encrypt, decrypt } = await import('@/lib/vault/crypto');
    const valor = 'sênha-çom-ação-😀';
    expect(decrypt(encrypt(valor))).toBe(valor);
  });

  it('o texto cifrado não contém o segredo', async () => {
    const { encrypt } = await import('@/lib/vault/crypto');
    expect(encrypt('token-secreto')).not.toContain('token-secreto');
  });

  // IV aleatório por chamada: dois valores iguais não podem produzir o mesmo
  // texto cifrado, senão dá para inferir que duas contas usam o mesmo segredo.
  it('cifra o mesmo valor de forma diferente a cada chamada', async () => {
    const { encrypt } = await import('@/lib/vault/crypto');
    expect(encrypt('igual')).not.toBe(encrypt('igual'));
  });

  // GCM autentica: adulterar o texto cifrado tem que falhar, não devolver lixo.
  it('recusa texto cifrado adulterado', async () => {
    const { encrypt, decrypt } = await import('@/lib/vault/crypto');
    const cipher = encrypt('token-secreto');
    const tampered = `${cipher.slice(0, -4)}AAAA`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('recusa texto cifrado com outra chave', async () => {
    const { encrypt } = await import('@/lib/vault/crypto');
    const cipher = encrypt('token-secreto');
    process.env.DAILY_WEB_SECRET_KEY = randomBytes(32).toString('base64');
    vi.resetModules();
    const { decrypt } = await import('@/lib/vault/crypto');
    expect(() => decrypt(cipher)).toThrow();
  });

  it('sem DAILY_WEB_SECRET_KEY falha em vez de guardar em claro', async () => {
    delete process.env.DAILY_WEB_SECRET_KEY;
    vi.resetModules();
    const { encrypt } = await import('@/lib/vault/crypto');
    expect(() => encrypt('token')).toThrow(/DAILY_WEB_SECRET_KEY/);
  });

  it('recusa chave com tamanho errado', async () => {
    process.env.DAILY_WEB_SECRET_KEY = randomBytes(16).toString('base64');
    vi.resetModules();
    const { encrypt } = await import('@/lib/vault/crypto');
    expect(() => encrypt('token')).toThrow(/32 bytes/);
  });

  it('isVaultConfigured reflete a presença de uma chave válida', async () => {
    const { isVaultConfigured } = await import('@/lib/vault/crypto');
    expect(isVaultConfigured()).toBe(true);
    delete process.env.DAILY_WEB_SECRET_KEY;
    vi.resetModules();
    const again = await import('@/lib/vault/crypto');
    expect(again.isVaultConfigured()).toBe(false);
  });
});
