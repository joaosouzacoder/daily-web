'use client';

import { useEffect, useState } from 'react';

const WEEKDAYS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];
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

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Reserva a altura final desde o primeiro render para não causar salto de
  // layout quando o relógio começa a marcar.
  if (!now) {
    return (
      <div className="now-clock">
        <span className="now-time mono" data-testid="clock-time">
          &nbsp;
        </span>
        <span className="now-date" data-testid="clock-date">
          &nbsp;
        </span>
      </div>
    );
  }

  return (
    <div className="now-clock">
      <time className="now-time mono" data-testid="clock-time">
        {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
      </time>
      <span className="now-date" data-testid="clock-date">
        {WEEKDAYS[now.getDay()]}, {now.getDate()} de {MONTHS[now.getMonth()]}
      </span>
    </div>
  );
}
