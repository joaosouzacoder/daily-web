'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { tabular } from '@/lib/theme';

function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = (total % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** Quanto falta para o ciclo de fundo buscar tudo de novo. O horário vem do
 *  servidor; aqui só se desconta o relógio local a cada segundo. */
export function NextRefreshCountdown({ nextAt }: { nextAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const target = nextAt ? new Date(nextAt).getTime() : NaN;
  if (Number.isNaN(target)) return null;

  const remaining = target - now;
  return (
    <span className={cn('type-caption text-ink-dim', tabular)} data-testid="next-refresh">
      {remaining > 0 ? `próxima em ${formatRemaining(remaining)}` : 'sincronizando…'}
    </span>
  );
}
