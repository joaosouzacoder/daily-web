import { describe, expect, it } from 'vitest';
import ical, { type CalendarComponent } from 'node-ical';
import { expandEvents, icsUrl } from '@/lib/integrations/ics';
import type { Connection } from '@/lib/vault/connections';

const conn: Connection = {
  id: 'cal-1',
  module: 'agenda',
  label: 'Pessoal',
  values: { icsUrl: 'https://exemplo/a.ics' },
};

function calendar(...events: string[]): Record<string, CalendarComponent | undefined> {
  return ical.sync.parseICS(
    ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//teste//', ...events, 'END:VCALENDAR'].join('\r\n'),
  );
}

function event(lines: string[]): string {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
}

const WINDOW_START = new Date('2026-08-24T00:00:00');
const WINDOW_END = new Date('2026-08-31T23:59:59');

describe('expandEvents', () => {
  it('lê um evento simples com data e hora', () => {
    const parsed = calendar(
      event(['UID:1', 'DTSTART:20260825T140000Z', 'DTEND:20260825T150000Z', 'SUMMARY:Reunião']),
    );
    const [item] = expandEvents(parsed, conn, WINDOW_START, WINDOW_END);
    expect(item.date).toBe('2026-08-25');
    expect(item.title).toBe('Reunião');
    expect(item.accountLabel).toBe('Pessoal');
  });

  it('marca evento de dia inteiro sem hora', () => {
    const parsed = calendar(
      event(['UID:2', 'DTSTART;VALUE=DATE:20260826', 'DTEND;VALUE=DATE:20260827', 'SUMMARY:Feriado']),
    );
    const [item] = expandEvents(parsed, conn, WINDOW_START, WINDOW_END);
    expect(item.time).toBe('');
    expect(item.title).toBe('Feriado');
  });

  it('descarta evento fora da janela', () => {
    const parsed = calendar(
      event(['UID:3', 'DTSTART:20260901T140000Z', 'DTEND:20260901T150000Z', 'SUMMARY:Depois']),
    );
    expect(expandEvents(parsed, conn, WINDOW_START, WINDOW_END)).toEqual([]);
  });

  it('expande um evento que se repete toda semana', () => {
    const parsed = calendar(
      event([
        'UID:4',
        'DTSTART:20260803T130000Z',
        'DTEND:20260803T133000Z',
        'RRULE:FREQ=WEEKLY;BYDAY=MO',
        'SUMMARY:Daily',
      ]),
    );
    const items = expandEvents(parsed, conn, WINDOW_START, WINDOW_END);
    expect(items.map((i) => i.date)).toEqual(['2026-08-24', '2026-08-31']);
  });

  it('pula a ocorrência cancelada de uma série', () => {
    const parsed = calendar(
      event([
        'UID:5',
        'DTSTART:20260803T130000Z',
        'DTEND:20260803T133000Z',
        'RRULE:FREQ=WEEKLY;BYDAY=MO',
        'EXDATE:20260824T130000Z',
        'SUMMARY:Daily',
      ]),
    );
    const items = expandEvents(parsed, conn, WINDOW_START, WINDOW_END);
    expect(items.map((i) => i.date)).toEqual(['2026-08-31']);
  });

  it('devolve o título vazio como marcador em vez de string vazia', () => {
    const parsed = calendar(event(['UID:6', 'DTSTART:20260825T140000Z', 'DTEND:20260825T150000Z']));
    expect(expandEvents(parsed, conn, WINDOW_START, WINDOW_END)[0].title).toBe('(sem título)');
  });

  it('ordena por data e hora', () => {
    const parsed = calendar(
      event(['UID:7', 'DTSTART:20260826T140000Z', 'DTEND:20260826T150000Z', 'SUMMARY:Depois']),
      event(['UID:8', 'DTSTART:20260825T090000Z', 'DTEND:20260825T093000Z', 'SUMMARY:Antes']),
    );
    expect(expandEvents(parsed, conn, WINDOW_START, WINDOW_END).map((i) => i.title)).toEqual([
      'Antes',
      'Depois',
    ]);
  });

  it('ignora componentes que não são evento', () => {
    const parsed = ical.sync.parseICS(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//teste//',
        'BEGIN:VTIMEZONE',
        'TZID:America/Sao_Paulo',
        'END:VTIMEZONE',
        'END:VCALENDAR',
      ].join('\r\n'),
    );
    expect(expandEvents(parsed, conn, WINDOW_START, WINDOW_END)).toEqual([]);
  });
});

describe('icsUrl', () => {
  it('converte webcal:// para https://', () => {
    expect(icsUrl({ ...conn, values: { icsUrl: 'webcal://exemplo/a.ics' } })).toBe(
      'https://exemplo/a.ics',
    );
  });

  it('recusa URL vazia com o rótulo da agenda no erro', () => {
    expect(() => icsUrl({ ...conn, values: {} })).toThrow(/Pessoal/);
  });

  it('recusa URL inválida', () => {
    expect(() => icsUrl({ ...conn, values: { icsUrl: 'não é url' } })).toThrow(
      /não parece uma URL/,
    );
  });

  it('recusa esquema que não seja http nem https', () => {
    expect(() => icsUrl({ ...conn, values: { icsUrl: 'file:///etc/passwd' } })).toThrow(
      /https:\/\//,
    );
  });

  // O erro que motivou o diagnóstico: colar a barra de endereços do navegador.
  it('nomeia o erro de colar o endereço da página do Google Agenda', () => {
    expect(() =>
      icsUrl({ ...conn, values: { icsUrl: 'https://calendar.google.com/calendar/u/0' } }),
    ).toThrow(/endereço da página/);
  });
});
