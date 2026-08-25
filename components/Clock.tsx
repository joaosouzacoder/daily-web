'use client';

import { useEffect, useState } from 'react';

const WEEKDAYS_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function formatDateLong(date: Date): string {
  return `${WEEKDAYS_PT[date.getDay()]}, ${date.getDate()} de ${MONTHS_PT[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour12: false });
}

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) return null;

  return (
    <div data-testid="clock">
      <div style={{ fontSize: '2rem' }}>{formatTime(now)}</div>
      <div style={{ color: 'var(--ctp-subtext0)' }}>{formatDateLong(now)}</div>
    </div>
  );
}
