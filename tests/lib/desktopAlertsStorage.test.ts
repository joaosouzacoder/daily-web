import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isEnabled, loadSeen, saveSeen, setEnabled } from '@/lib/desktopAlertsStorage';

describe('armazenamento dos avisos do computador', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => vi.restoreAllMocks());

  it('trata JSON inválido e formato errado como estado vazio', () => {
    localStorage.setItem('daily-web.desktop-alerts.v1', '{');
    expect(loadSeen()).toEqual({ v: 1, sources: {}, reminders: [] });

    localStorage.setItem(
      'daily-web.desktop-alerts.v1',
      JSON.stringify({ v: 1, sources: { email: [42] }, reminders: [] }),
    );
    expect(loadSeen()).toEqual({ v: 1, sources: {}, reminders: [] });

    localStorage.setItem(
      'daily-web.desktop-alerts.v1',
      JSON.stringify({ v: 1, sources: [], reminders: [] }),
    );
    expect(loadSeen()).toEqual({ v: 1, sources: {}, reminders: [] });
  });

  it('não deixa uma recusa do localStorage quebrar nenhuma operação', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });

    expect(() => loadSeen()).not.toThrow();
    expect(loadSeen()).toEqual({ v: 1, sources: {}, reminders: [] });
    expect(() => saveSeen({ v: 1, sources: {}, reminders: [] })).not.toThrow();
    expect(() => isEnabled()).not.toThrow();
    expect(isEnabled()).toBe(false);
    expect(() => setEnabled(true)).not.toThrow();
  });
});
