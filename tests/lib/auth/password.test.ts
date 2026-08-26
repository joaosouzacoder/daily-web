import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { verifyPassword } from '@/lib/auth/password';

describe('verifyPassword', () => {
  it('aceita a senha certa contra o hash bcrypt', async () => {
    const hash = await bcrypt.hash('minha-senha', 10);
    expect(await verifyPassword('minha-senha', hash)).toBe(true);
  });

  it('rejeita senha errada', async () => {
    const hash = await bcrypt.hash('minha-senha', 10);
    expect(await verifyPassword('outra-senha', hash)).toBe(false);
  });
});
