import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from '@/lib/auth/session';

const SECRET = 'segredo-de-teste';

describe('createSessionToken / verifySessionToken', () => {
  it('gera um token que verifica com sucesso e devolve o usuário', async () => {
    const token = await createSessionToken('u-1', 'joao', SECRET);
    const payload = await verifySessionToken(token, SECRET, 60_000);
    expect(payload?.user).toBe('joao');
    expect(payload?.userId).toBe('u-1');
  });

  // Identidade é o userId: renomear alguém não pode migrar dado nenhum.
  it('distingue dois usuários pelo userId', async () => {
    const a = await verifySessionToken(await createSessionToken('u-1', 'joao', SECRET), SECRET, 60_000);
    const b = await verifySessionToken(await createSessionToken('u-2', 'maria', SECRET), SECRET, 60_000);
    expect(a?.userId).not.toBe(b?.userId);
  });

  // Cookie emitido antes do multiusuário não carrega userId; aceitá-lo daria
  // uma sessão sem dono, que o estágio 2 não saberia atribuir.
  it('recusa payload legado, sem userId', async () => {
    const legacy = Buffer.from(JSON.stringify({ user: 'joao', issuedAt: Date.now() }), 'utf8').toString('base64url');
    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', SECRET).update(legacy).digest('base64url');
    expect(await verifySessionToken(`${legacy}.${sig}`, SECRET, 60_000)).toBeNull();
  });

  it('rejeita token assinado com outro segredo', async () => {
    const token = await createSessionToken('u-1', 'joao', SECRET);
    const payload = await verifySessionToken(token, 'outro-segredo', 60_000);
    expect(payload).toBeNull();
  });

  it('rejeita token adulterado', async () => {
    const token = await createSessionToken('u-1', 'joao', SECRET);
    const tampered = `${token.slice(0, -2)}xx`;
    expect(await verifySessionToken(tampered, SECRET, 60_000)).toBeNull();
  });

  it('rejeita token expirado', async () => {
    const token = await createSessionToken('u-1', 'joao', SECRET);
    await new Promise((r) => setTimeout(r, 10));
    expect(await verifySessionToken(token, SECRET, 1)).toBeNull();
  });

  it('rejeita string mal formada', async () => {
    expect(await verifySessionToken('lixo-sem-ponto', SECRET, 60_000)).toBeNull();
  });
});
