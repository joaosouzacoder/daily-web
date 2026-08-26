'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Settings } from 'iconoir-react';
import type { PomodoroState } from '@/lib/types';
import { Clock } from './Clock';
import { Pomodoro } from './Pomodoro';

interface Props {
  pomodoro: PomodoroState | null;
  loading: boolean;
  onRefresh: () => void;
  onChanged: () => void;
  bell: ReactNode;
  updatedAt: string | null;
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return 'sincronizando';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'sincronizando';
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `atualizado ${h}:${m}`;
}

export function NowBand({ pomodoro, loading, onRefresh, onChanged, bell, updatedAt }: Props) {
  return (
    <header className="now">
      <div className="now-main">
        <Clock />
        <Pomodoro pomodoro={pomodoro} onChanged={onChanged} />
      </div>
      <div className="now-aside">
        <span className="now-sync mono">{formatUpdatedAt(updatedAt)}</span>
        <button type="button" className="btn" onClick={onRefresh} disabled={loading}>
          {loading ? 'Atualizando' : 'Atualizar'}
        </button>
        {bell}
        <Link className="icon-btn" href="/config" aria-label="configuração">
          <Settings width={16} height={16} />
        </Link>
      </div>
    </header>
  );
}
