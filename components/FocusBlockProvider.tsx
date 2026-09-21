'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { AgendaCalendarRef } from '@/lib/types';
import { defaultStart, DURATIONS, type FocusSource } from '@/lib/focusBlock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FocusBlockContextValue {
  enabled: boolean;
  schedule: (source: FocusSource) => void;
}

const FocusBlockContext = createContext<FocusBlockContextValue>({
  enabled: false,
  schedule: () => {},
});

export function useFocusBlock(): FocusBlockContextValue {
  return useContext(FocusBlockContext);
}

interface Props {
  calendars: AgendaCalendarRef[];
  onCreated: () => void;
  children: ReactNode;
}

function localParts(date: Date): { day: string; time: string } {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return { day: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

export function FocusBlockProvider({ calendars, onCreated, children }: Props) {
  const writable = useMemo(() => calendars.filter((calendar) => calendar.canWrite), [calendars]);
  const [source, setSource] = useState<FocusSource | null>(null);
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [minutes, setMinutes] = useState<(typeof DURATIONS)[number]>(50);
  const [connectionId, setConnectionId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schedule = (next: FocusSource) => {
    const initial = localParts(defaultStart(new Date()));
    setSource(next);
    setDay(initial.day);
    setTime(initial.time);
    setMinutes(50);
    setConnectionId((writable[0] ?? calendars[0])?.id ?? '');
    setError(null);
  };

  const close = () => {
    if (!saving) setSource(null);
  };

  const save = async () => {
    if (!source || writable.length === 0) return;
    const start = new Date(`${day}T${time}:00`);
    if (Number.isNaN(start.getTime())) {
      setError('Informe uma data e um horário válidos.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/agenda/focus-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, item: source, start: start.toISOString(), minutes }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? 'Não foi possível criar o bloco de foco.');
        return;
      }
      setSource(null);
      toast('Bloco de foco criado');
      onCreated();
    } catch {
      setError('Não foi possível criar o bloco de foco.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FocusBlockContext.Provider value={{ enabled: calendars.length > 0, schedule }}>
      {children}
      <Dialog open={source !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar foco</DialogTitle>
            <DialogDescription>{source?.title}</DialogDescription>
          </DialogHeader>

          {writable.length === 0 ? (
            <div className="space-y-3 text-sm">
              <p>Para criar blocos de foco, reconecte sua conta do Google.</p>
              {calendars[0] && (
                <a
                  className="text-brand underline"
                  href={`/api/integrations/agenda/google/start?login_hint=${encodeURIComponent(calendars[0].account)}`}
                >
                  Reconectar {calendars[0].account || calendars[0].label}
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-sm">
                  <span>Dia</span>
                  <Input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Início</span>
                  <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
                </label>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm">Duração</legend>
                <div className="flex flex-wrap gap-2">
                  {DURATIONS.map((duration) => (
                    <Button
                      key={duration}
                      type="button"
                      size="sm"
                      variant={minutes === duration ? 'default' : 'outline'}
                      onClick={() => setMinutes(duration)}
                    >
                      {duration} min
                    </Button>
                  ))}
                </div>
              </fieldset>
              {writable.length > 1 && (
                <label className="block space-y-1 text-sm">
                  <span>Agenda</span>
                  <select
                    className="h-9 w-full rounded-md border border-line-strong bg-surface-2 px-3"
                    value={connectionId}
                    onChange={(event) => setConnectionId(event.target.value)}
                  >
                    {writable.map((calendar) => (
                      <option key={calendar.id} value={calendar.id}>{calendar.label}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={saving}>Cancelar</Button>
            {writable.length > 0 && (
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? 'Criando…' : 'Criar bloco'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FocusBlockContext.Provider>
  );
}
