import type { AgendaItem, PanelResult } from '@/lib/types';
import { Section } from './ui/Section';
import { EmptyState } from './ui/EmptyState';
import { SkeletonRows } from './ui/Skeleton';

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function groupByDate(items: AgendaItem[]): Map<string, AgendaItem[]> {
  const sorted = [...items].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
  const map = new Map<string, AgendaItem[]>();
  for (const item of sorted) {
    const list = map.get(item.date) ?? [];
    list.push(item);
    map.set(item.date, list);
  }
  return map;
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// "hoje" e "amanhã" carregam mais informação que a data crua; o resto ganha
// dia da semana, que é como se pensa numa agenda de 7 dias.
export function relativeDayLabel(iso: string, today: Date = new Date()): string {
  const todayIso = toLocalDateString(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (iso === todayIso) return 'hoje';
  if (iso === toLocalDateString(tomorrow)) return 'amanhã';

  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const date = new Date(year, month - 1, day);
  return `${WEEKDAYS[date.getDay()]}, ${day} de ${MONTHS[month - 1]}`;
}

interface Props {
  agenda: PanelResult<AgendaItem[]>;
  loading?: boolean;
}

export function AgendaPanel({ agenda, loading = false }: Props) {
  const all = agenda.data ?? [];
  const groups = groupByDate(all);

  return (
    <Section eyebrow="Agenda">
      {agenda.error && (
        <p role="alert" className="panel-error">
          {agenda.error}
        </p>
      )}

      {loading && all.length === 0 && <SkeletonRows count={4} />}

      {!loading && all.length === 0 && !agenda.error && (
        <EmptyState message="Nada agendado nos próximos 7 dias." />
      )}

      {[...groups.entries()].map(([date, items]) => (
        <div key={date} className="agenda-day">
          <h3 className="agenda-day-label eyebrow">{relativeDayLabel(date)}</h3>
          <ul>
            {items.map((item, i) => (
              <li key={`${date}-${i}`} className="agenda-item">
                <span className="agenda-time mono">{item.time || 'dia'}</span>
                <span className="agenda-title">{item.title}</span>
                <span className="row-tag mono">{item.account === 'work' ? 'W' : 'P'}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Section>
  );
}
