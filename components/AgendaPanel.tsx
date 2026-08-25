import type { AgendaItem, PanelResult } from '@/lib/types';

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

export function AgendaPanel({ agenda }: { agenda: PanelResult<AgendaItem[]> }) {
  const groups = groupByDate(agenda.data ?? []);
  return (
    <section className="card" data-testid="agenda-panel">
      <h2>Agenda</h2>
      {agenda.error && <p role="alert">{agenda.error}</p>}
      {[...groups.entries()].map(([date, items]) => (
        <div key={date}>
          <strong>{date}</strong>
          <ul>
            {items.map((item, i) => (
              <li key={i}>
                <span>[{item.account === 'work' ? 'W' : 'P'}]</span>{' '}
                {item.time || 'dia inteiro'} — {item.title}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
