'use client';

import { useState } from 'react';
import type { AgendaItem, PanelResult } from '@/lib/types';
import { AGENDA_RANGES, agendaRange } from '@/lib/agendaWindow';
import { Section } from './ui/Section';
import { FilterBar } from './ui/FilterBar';
import { Chip } from './ui/Chip';
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
// dia da semana, que é como se pensa numa agenda de vários dias.
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
  /** Quantos dias a agenda cobre hoje, contando o dia atual. */
  days: number;
  onChanged: () => void;
  loading?: boolean;
}

export function AgendaPanel({ agenda, days, onChanged, loading = false }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = agenda.data ?? [];
  const groups = groupByDate(all);
  // Com uma agenda só, repetir o nome dela em cada linha é ruído: não há o
  // que desambiguar. Mesmo critério do painel de e-mail com as caixas.
  const multiplasAgendas = new Set(all.map((item) => item.account)).size > 1;

  // Mudar o período muda o que o servidor busca, não só o que a tela filtra:
  // pedir 14 dias e recortar 1 seria puxar duas semanas de eventos à toa a
  // cada ciclo do refresher.
  const chooseRange = async (nextDays: number) => {
    if (nextDays === days) return;
    setSaving(true);
    setError(null);
    const res = await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agendaDays: nextDays }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Falha ao mudar o período');
      return;
    }
    onChanged();
  };

  return (
    <Section eyebrow="Agenda">
      <FilterBar label="Período da agenda">
        {AGENDA_RANGES.map((range) => (
          <Chip
            key={range.days}
            active={range.days === days}
            onClick={() => void chooseRange(range.days)}
            disabled={saving}
          >
            {range.label}
          </Chip>
        ))}
      </FilterBar>

      {agenda.error && (
        <p role="alert" className="panel-error">
          {agenda.error}
        </p>
      )}
      {error && (
        <p role="alert" className="panel-error">
          {error}
        </p>
      )}

      {loading && all.length === 0 && <SkeletonRows count={3} />}

      {!loading && all.length === 0 && !agenda.error && (
        <EmptyState message={`Nada agendado ${agendaRange(days).emptyLabel}.`} />
      )}

      {[...groups.entries()].map(([date, items]) => (
        <div key={date} className="agenda-day">
          <h3 className="agenda-day-label eyebrow">{relativeDayLabel(date)}</h3>
          <ul>
            {items.map((item, i) => (
              <li key={`${date}-${i}`} className="agenda-item">
                <span className="agenda-time mono">{item.time || 'dia'}</span>
                <span className="agenda-title">{item.title}</span>
                {multiplasAgendas && item.accountLabel && (
                  <span className="row-tag">{item.accountLabel}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Section>
  );
}
