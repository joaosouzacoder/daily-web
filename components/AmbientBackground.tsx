'use client';

import { useEffect, useState } from 'react';
import { ambientForHour } from '@/lib/ambient';

// Assinatura visual do produto: a tela inteira funciona como um segundo
// relógio. O tom acompanha a hora local e esquenta durante uma sessão de
// foco. O estado de foco chega pelo evento que o Pomodoro emite — não abre
// uma segunda fonte de verdade nem uma requisição própria.
export function AmbientBackground() {
  const [hour, setHour] = useState<number | null>(null);
  const [focusing, setFocusing] = useState(false);

  useEffect(() => {
    const update = () => setHour(new Date().getHours());
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onFocusChange = (event: Event) => {
      setFocusing((event as CustomEvent<boolean>).detail);
    };
    window.addEventListener('daily-web:focus', onFocusChange);
    return () => window.removeEventListener('daily-web:focus', onFocusChange);
  }, []);

  if (hour === null) return <div className="ambient" aria-hidden="true" />;

  const { top, bottom } = ambientForHour(hour, focusing);
  return (
    <div
      className="ambient"
      aria-hidden="true"
      style={{ '--ambient-top': top, '--ambient-bottom': bottom } as React.CSSProperties}
    />
  );
}
