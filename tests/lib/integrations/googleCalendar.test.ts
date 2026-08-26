import { describe, expect, it } from 'vitest';
import { selectedCalendars, refreshToken, toAgendaItem } from '@/lib/integrations/google/calendar';
import { isGoogle } from '@/lib/integrations/agenda';
import type { Connection } from '@/lib/vault/connections';

function conn(values: Record<string, string>): Connection {
  return { id: 'cal-1', module: 'agenda', label: 'Google Agenda', values };
}

describe('toAgendaItem', () => {
  it('lê um evento com hora', () => {
    const item = toAgendaItem(
      { summary: 'Reunião', start: { dateTime: '2026-08-26T14:00:00-03:00' } },
      'cal-1',
      'Work',
    );
    expect(item).toMatchObject({ date: '2026-08-26', title: 'Reunião', accountLabel: 'Work' });
    expect(item?.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it('lê evento de dia inteiro sem hora', () => {
    const item = toAgendaItem({ summary: 'Feriado', start: { date: '2026-08-27' } }, 'c', 'W');
    expect(item).toMatchObject({ date: '2026-08-27', time: '', title: 'Feriado' });
  });

  // Um evento cancelado continua vindo na resposta da API, marcado.
  it('descarta evento cancelado', () => {
    expect(
      toAgendaItem({ summary: 'X', status: 'cancelled', start: { date: '2026-08-27' } }, 'c', 'W'),
    ).toBeNull();
  });

  it('descarta evento sem início', () => {
    expect(toAgendaItem({ summary: 'X' }, 'c', 'W')).toBeNull();
    expect(toAgendaItem({ summary: 'X', start: { dateTime: 'não é data' } }, 'c', 'W')).toBeNull();
  });

  it('usa marcador quando não há título', () => {
    expect(toAgendaItem({ start: { date: '2026-08-27' } }, 'c', 'W')?.title).toBe('(sem título)');
  });
});

describe('selectedCalendars', () => {
  it('lê a lista separada por vírgula', () => {
    expect(selectedCalendars(conn({ calendarIds: 'a@x.com, b@y.com' }))).toEqual([
      'a@x.com',
      'b@y.com',
    ]);
  });

  it('devolve vazio quando nada foi escolhido', () => {
    expect(selectedCalendars(conn({}))).toEqual([]);
  });
});

describe('refreshToken', () => {
  it('recusa conexão sem token, dizendo qual é', () => {
    expect(() => refreshToken(conn({ provider: 'google' }))).toThrow(/Google Agenda/);
  });

  it('devolve o token gravado', () => {
    expect(refreshToken(conn({ refreshToken: 'r' }))).toBe('r');
  });
});

describe('escolha do provedor da agenda', () => {
  it('reconhece conexão do Google', () => {
    expect(isGoogle(conn({ provider: 'google' }))).toBe(true);
  });

  // As conexões criadas antes do OAuth existir não têm o campo; elas são iCal.
  it('trata conexão sem provedor como link iCal', () => {
    expect(isGoogle(conn({ icsUrl: 'https://x/a.ics' }))).toBe(false);
    expect(isGoogle(conn({ provider: 'ics' }))).toBe(false);
  });
});
