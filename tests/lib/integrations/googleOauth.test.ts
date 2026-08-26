import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  authorizationUrl,
  describeTokenError,
  isGoogleConfigured,
  signState,
  verifyState,
} from '@/lib/integrations/google/oauth';

const SECRET = 'segredo-de-sessao';
const CLIENT = {
  clientId: 'abc.apps.googleusercontent.com',
  clientSecret: 'shh',
  redirectUri: 'https://exemplo.com/api/integrations/agenda/google/callback',
};

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('state do OAuth', () => {
  it('volta o mesmo usuário que iniciou', () => {
    const state = signState('u-1', SECRET);
    expect(verifyState(state, SECRET)).toEqual({ userId: 'u-1' });
  });

  // Sem assinatura, qualquer um monta um state apontando para outro usuário e
  // conclui o fluxo dentro da conta dele.
  it('recusa state assinado com outro segredo', () => {
    const state = signState('u-1', 'outro-segredo');
    expect(verifyState(state, SECRET)).toBeNull();
  });

  it('recusa state adulterado', () => {
    const state = signState('u-1', SECRET);
    const [payload, signature] = state.split('.');
    const forjado = Buffer.from(JSON.stringify({ userId: 'u-2', at: Date.now() })).toString(
      'base64url',
    );
    expect(verifyState(`${forjado}.${signature}`, SECRET)).toBeNull();
    expect(verifyState(`${payload}.aaaa`, SECRET)).toBeNull();
  });

  it('recusa state velho', () => {
    const agora = Date.now();
    const state = signState('u-1', SECRET, agora - 11 * 60 * 1000);
    expect(verifyState(state, SECRET, agora)).toBeNull();
  });

  it('recusa state do futuro', () => {
    const agora = Date.now();
    const state = signState('u-1', SECRET, agora + 10 * 60 * 1000);
    expect(verifyState(state, SECRET, agora)).toBeNull();
  });

  it('recusa lixo', () => {
    for (const ruim of ['', 'sem-ponto', 'a.b', '..']) {
      expect(verifyState(ruim, SECRET)).toBeNull();
    }
  });

  it('dois states do mesmo usuário são diferentes', () => {
    expect(signState('u-1', SECRET)).not.toBe(signState('u-1', SECRET));
  });
});

describe('authorizationUrl', () => {
  it('pede acesso offline com consentimento, que é o que garante refresh token', () => {
    const url = new URL(authorizationUrl(CLIENT, 'estado'));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('estado');
    expect(url.searchParams.get('redirect_uri')).toBe(CLIENT.redirectUri);
  });

  it('pede só leitura da agenda', () => {
    const url = new URL(authorizationUrl(CLIENT, 'e'));
    expect(url.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/calendar.readonly',
    );
  });

  it('passa o login_hint quando informado', () => {
    const url = new URL(authorizationUrl(CLIENT, 'e', 'a@b.com'));
    expect(url.searchParams.get('login_hint')).toBe('a@b.com');
  });
});

describe('describeTokenError', () => {
  it('diz o que fazer quando a URI de retorno não está registrada', () => {
    process.env.PUBLIC_ORIGIN = 'https://exemplo.com';
    expect(describeTokenError({ error: 'redirect_uri_mismatch' })).toContain(
      '/api/integrations/agenda/google/callback',
    );
  });

  it('explica autorização revogada', () => {
    expect(describeTokenError({ error: 'invalid_grant' })).toContain('Conecte de novo');
  });

  it('aponta as variáveis quando o client está errado', () => {
    expect(describeTokenError({ error: 'invalid_client' })).toContain('GOOGLE_CLIENT_ID');
  });
});

describe('isGoogleConfigured', () => {
  beforeEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it('exige os dois lados', () => {
    expect(isGoogleConfigured()).toBe(false);
    process.env.GOOGLE_CLIENT_ID = 'x';
    expect(isGoogleConfigured()).toBe(false);
    process.env.GOOGLE_CLIENT_SECRET = 'y';
    expect(isGoogleConfigured()).toBe(true);
  });
});
