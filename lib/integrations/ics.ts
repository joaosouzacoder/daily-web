import ical, { type CalendarComponent, type VEvent } from 'node-ical';
import { computeAgendaWindow } from '@/lib/agendaWindow';
import { diagnoseIcsResponse, diagnoseIcsUrl } from './icsDiagnostics';
import type { Connection } from '@/lib/vault/connections';
import type { AgendaItem } from '@/lib/types';

const FETCH_TIMEOUT_MS = 20_000;
const MAX_ICS_BYTES = 8 * 1024 * 1024;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Evento de dia inteiro não tem hora para mostrar. O node-ical marca isso em
 *  `datetype`; sem a marca, meia-noite cravada é o melhor palpite. */
function isAllDay(event: VEvent, start: Date): boolean {
  if (event.datetype === 'date') return true;
  return start.getHours() === 0 && start.getMinutes() === 0 && start.getSeconds() === 0;
}

function isVEvent(component: CalendarComponent): component is VEvent {
  return component.type === 'VEVENT';
}

function excluded(event: VEvent, occurrence: Date): boolean {
  const exdate = event.exdate as Record<string, Date> | undefined;
  if (!exdate) return false;
  return Object.values(exdate).some((d) => d.getTime() === occurrence.getTime());
}

/** Uma ocorrência remarcada vem como registro à parte, indexado pela data
 *  original: sem consultar isso, a série repetiria o horário antigo. */
function overrideFor(event: VEvent, occurrence: Date): VEvent | null {
  const recurrences = event.recurrences as Record<string, VEvent> | undefined;
  if (!recurrences) return null;
  const key = localDate(occurrence);
  return recurrences[key] ?? null;
}

function toItem(conn: Connection, start: Date, event: VEvent): AgendaItem {
  return {
    account: conn.id,
    accountLabel: conn.label,
    date: localDate(start),
    time: isAllDay(event, start) ? '' : localTime(start),
    title: (event.summary ?? '').toString().trim() || '(sem título)',
  };
}

/** Expande os eventos do calendário dentro da janela, resolvendo repetições,
 *  exceções e remarcações. Separada do fetch para poder ser testada com um
 *  .ics literal, sem rede. */
export function expandEvents(
  parsed: Record<string, CalendarComponent | undefined>,
  conn: Connection,
  windowStart: Date,
  windowEnd: Date,
): AgendaItem[] {
  const items: AgendaItem[] = [];

  for (const component of Object.values(parsed)) {
    if (!component || !isVEvent(component)) continue;
    const event = component;

    if (event.rrule) {
      for (const occurrence of event.rrule.between(windowStart, windowEnd, true)) {
        if (excluded(event, occurrence)) continue;
        const override = overrideFor(event, occurrence);
        if (override) {
          const start = override.start ?? occurrence;
          if (start >= windowStart && start <= windowEnd) items.push(toItem(conn, start, override));
          continue;
        }
        items.push(toItem(conn, occurrence, event));
      }
      continue;
    }

    const start = event.start;
    if (!start) continue;
    if (start < windowStart || start > windowEnd) continue;
    items.push(toItem(conn, start, event));
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export function icsUrl(conn: Connection): string {
  const raw = (conn.values.icsUrl ?? '').trim();
  const problem = diagnoseIcsUrl(raw);
  if (problem) throw new Error(`${conn.label}: ${problem}`);
  // O Google entrega o mesmo arquivo por https; webcal:// é só um apelido que
  // o fetch do Node não conhece.
  return new URL(raw.replace(/^webcal:\/\//i, 'https://')).toString();
}

export async function fetchIcs(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: 'text/calendar, text/plain' },
    redirect: 'follow',
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        'o endereço não existe (404). Se o calendário é de uma conta corporativa, o administrador pode ter bloqueado o compartilhamento externo — nesse caso use a conexão pelo Google',
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('o endereço foi recusado — gere um "Endereço secreto no formato iCal" novo');
    }
    throw new Error(`o servidor respondeu ${response.status}`);
  }

  const text = await response.text();
  if (text.length > MAX_ICS_BYTES) throw new Error('o arquivo do iCal é grande demais');
  if (!text.includes('BEGIN:VCALENDAR')) {
    throw new Error(diagnoseIcsResponse(response.headers.get('content-type'), text));
  }
  return text;
}

export async function fetchAgenda(conn: Connection, now: Date = new Date()): Promise<AgendaItem[]> {
  const text = await fetchIcs(icsUrl(conn));
  const window = computeAgendaWindow(now);
  const start = new Date(`${window.start}T00:00:00`);
  const end = new Date(`${window.end}T23:59:59`);
  return expandEvents(ical.sync.parseICS(text), conn, start, end);
}

export async function testConnection(conn: Connection): Promise<void> {
  await fetchIcs(icsUrl(conn));
}
