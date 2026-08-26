import { describe, expect, it } from 'vitest';
import { describeMailError } from '@/lib/integrations/mailErrors';

describe('describeMailError', () => {
  it('aponta a senha de app quando o Gmail recusa a senha da conta', () => {
    const err = Object.assign(new Error('Invalid credentials (Failure)'), {
      responseText: '[ALERT] Application-specific password required',
    });
    expect(describeMailError(err)).toContain('apppasswords');
  });

  it('explica credencial recusada em vez de repetir o código do servidor', () => {
    expect(describeMailError(new Error('AUTHENTICATIONFAILED'))).toContain('senha de app');
  });

  it('reconhece host inexistente', () => {
    expect(describeMailError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND imap.errado' })).toBe(
      'servidor não encontrado. Confira o endereço do IMAP',
    );
  });

  it('reconhece porta errada pelo erro de TLS', () => {
    expect(describeMailError(new Error('wrong version number'))).toContain('993');
  });

  it('reconhece tempo esgotado', () => {
    expect(describeMailError({ code: 'ETIMEDOUT', message: 'connect ETIMEDOUT' })).toContain(
      'não respondeu a tempo',
    );
  });

  it('devolve o texto original quando não reconhece o erro', () => {
    expect(describeMailError(new Error('algo bem específico'))).toBe('algo bem específico');
  });

  it('não quebra com erro vazio', () => {
    expect(describeMailError(undefined)).toBe('falha ao falar com o servidor');
    expect(describeMailError(new Error(''))).toBe('falha ao falar com o servidor');
  });
});
