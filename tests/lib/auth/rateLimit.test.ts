import { describe, expect, it, beforeEach } from 'vitest';
import { isRateLimited, registerFailedAttempt, clearAttempts } from '@/lib/auth/rateLimit';

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
