import * as ics from './ics';
import * as google from './google/calendar';
import type { Connection } from '@/lib/vault/connections';
import type { AgendaItem } from '@/lib/types';
import { CALENDAR_EVENTS_SCOPE, hasScope } from './google/oauth';

// Uma agenda chega por dois caminhos: OAuth do Google, ou uma URL iCal. O
// provedor fica gravado na conexão; sem ele, é iCal — que era o único caminho
// quando as conexões antigas foram criadas.
export function isGoogle(conn: Connection): boolean {
  return conn.values.provider === 'google';
}

export function canWriteEvents(conn: Connection): boolean {
  return isGoogle(conn) && hasScope(conn.values.scope ?? '', CALENDAR_EVENTS_SCOPE);
}

export function fetchAgenda(
  conn: Connection,
  now?: Date,
  days?: number,
): Promise<AgendaItem[]> {
  return isGoogle(conn)
    ? google.fetchAgenda(conn, now, days)
    : ics.fetchAgenda(conn, now, days);
}

export function testConnection(conn: Connection): Promise<void> {
  return isGoogle(conn) ? google.testConnection(conn) : ics.testConnection(conn);
}
