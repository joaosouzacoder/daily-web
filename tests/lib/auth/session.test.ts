import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from '@/lib/auth/session';

const SECRET = 'segredo-de-teste';

describe('createSessionToken / verifySessionToken', () => {
  it('gera um token que verifica com sucesso e devolve o usuário', async () => {
    const token = await createSessionToken('joao', SECRET);
    const payload = await verifySessionToken(token, SECRET, 60_000);
    expect(payload?.user).toBe('joao');
  });

  it('rejeita token assinado com outro segredo', async () => {
    const token = await createSessionToken('joao', SECRET);
    const payload = await verifySessionToken(token, 'outro-segredo', 60_000);
    expect(payload).toBeNull();
  });

  it('rejeita token adulterado', async () => {
    const token = await createSessionToken('joao', SECRET);
    const tampered = `${token.slice(0, -2)}xx`;
    expect(await verifySessionToken(tampered, SECRET, 60_000)).toBeNull();
  });

  it('rejeita token expirado', async () => {
    const token = await createSessionToken('joao', SECRET);
    await new Promise((r) => setTimeout(r, 10));
    expect(await verifySessionToken(token, SECRET, 1)).toBeNull();
  });

  it('rejeita string mal formada', async () => {
    expect(await verifySessionToken('lixo-sem-ponto', SECRET, 60_000)).toBeNull();
  });
});
