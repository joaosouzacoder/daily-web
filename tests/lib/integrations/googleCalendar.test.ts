import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFocusBlock, selectedCalendars, refreshToken, toAgendaItem } from '@/lib/integrations/google/calendar';
import { canWriteEvents, isGoogle } from '@/lib/integrations/agenda';
import { CALENDAR_EVENTS_SCOPE } from '@/lib/integrations/google/oauth';
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

describe('canWriteEvents', () => {
  it('aceita Google com o escopo de eventos', () => {
    expect(canWriteEvents(conn({ provider: 'google', scope: `openid ${CALENDAR_EVENTS_SCOPE}` }))).toBe(true);
  });

  it('recusa Google sem os escopos gravados', () => {
    expect(canWriteEvents(conn({ provider: 'google' }))).toBe(false);
  });

  it('recusa conexão iCal', () => {
    expect(canWriteEvents(conn({ provider: 'ics', scope: CALENDAR_EVENTS_SCOPE }))).toBe(false);
  });
});

describe('createFocusBlock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it('troca o token, cria o evento em UTC e devolve a linha da agenda', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        summary: '🔒 DEV-1 — Corrigir busca',
        start: { dateTime: '2026-09-22T13:00:00.000Z' },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const item = await createFocusBlock(conn({ provider: 'google', refreshToken: 'refresh' }), {
      title: '🔒 DEV-1 — Corrigir busca',
      description: 'Bloco de foco criado pelo daily-web.',
      start: new Date('2026-09-22T13:00:00.000Z'),
      end: new Date('2026-09-22T13:50:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url.endsWith('/calendars/primary/events')).toBe(true);
    expect(options.method).toBe('POST');
    expect(JSON.parse(String(options.body))).toMatchObject({
      summary: '🔒 DEV-1 — Corrigir busca',
      start: { dateTime: '2026-09-22T13:00:00.000Z' },
      end: { dateTime: '2026-09-22T13:50:00.000Z' },
      extendedProperties: { private: { dailyWebFocus: '1' } },
    });
    expect(item).toMatchObject({ account: 'cal-1', accountLabel: 'Google Agenda', title: '🔒 DEV-1 — Corrigir busca' });
  });

  it('orienta a reconectar quando o Google nega a escrita', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 403 })));

    await expect(createFocusBlock(conn({ provider: 'google', refreshToken: 'refresh' }), {
      title: 'Foco',
      description: 'Descrição',
      start: new Date('2026-09-22T13:00:00.000Z'),
      end: new Date('2026-09-22T13:50:00.000Z'),
    })).rejects.toThrow('o Google negou a permissão para criar eventos — reconecte a agenda');
  });
});
