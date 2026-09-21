import { describe, expect, it } from 'vitest';
import { signOAuthState, verifyOAuthState } from '@/lib/integrations/oauthState';

describe('state compartilhado do OAuth', () => {
  it('assina e recupera usuário e finalidade', () => {
    const state = signOAuthState('u-1', 'slack', 'segredo', 1_000);
    expect(verifyOAuthState(state, 'segredo', 1_000)).toEqual({
      userId: 'u-1',
      purpose: 'slack',
    });
  });

  it('recusa assinatura adulterada', () => {
    const state = signOAuthState('u-1', 'slack', 'segredo');
    expect(verifyOAuthState(`${state}x`, 'segredo')).toBeNull();
  });

  it('recusa state expirado', () => {
    const state = signOAuthState('u-1', 'slack', 'segredo', 1_000);
    expect(verifyOAuthState(state, 'segredo', 1_000 + 11 * 60 * 1_000)).toBeNull();
  });

  it('recusa outro segredo', () => {
    const state = signOAuthState('u-1', 'slack', 'segredo');
    expect(verifyOAuthState(state, 'outro')).toBeNull();
  });
});
