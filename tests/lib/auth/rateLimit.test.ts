import { describe, expect, it, beforeEach } from 'vitest';
import { isRateLimited, registerFailedAttempt, clearAttempts, extractClientIp } from '@/lib/auth/rateLimit';

describe('rateLimit', () => {
  beforeEach(() => clearAttempts('1.2.3.4'));

  it('não bloqueia antes do limite', () => {
    for (let i = 0; i < 4; i += 1) registerFailedAttempt('1.2.3.4');
    expect(isRateLimited('1.2.3.4')).toBe(false);
  });

  it('bloqueia ao atingir o limite de tentativas', () => {
    for (let i = 0; i < 5; i += 1) registerFailedAttempt('1.2.3.4');
    expect(isRateLimited('1.2.3.4')).toBe(true);
  });

  it('clearAttempts libera o IP', () => {
    for (let i = 0; i < 5; i += 1) registerFailedAttempt('1.2.3.4');
    clearAttempts('1.2.3.4');
    expect(isRateLimited('1.2.3.4')).toBe(false);
  });

  it('IPs diferentes têm contadores independentes', () => {
    for (let i = 0; i < 5; i += 1) registerFailedAttempt('1.2.3.4');
    expect(isRateLimited('5.6.7.8')).toBe(false);
  });
});

describe('extractClientIp', () => {
  it('usa a última entrada do X-Forwarded-For (a que o Traefik anexou), não a primeira forjável pelo cliente', () => {
    expect(extractClientIp('9.9.9.9, 10.0.0.1, 203.0.113.5')).toBe('203.0.113.5');
  });

  it('um atacante trocando a primeira entrada a cada tentativa continua caindo na mesma chave', () => {
    expect(extractClientIp('forjado-1, 203.0.113.5')).toBe(
      extractClientIp('forjado-2, 203.0.113.5'),
    );
  });

  it('header com um único valor devolve esse valor', () => {
    expect(extractClientIp('203.0.113.5')).toBe('203.0.113.5');
  });

  it('header ausente devolve "unknown"', () => {
    expect(extractClientIp(null)).toBe('unknown');
  });
});
