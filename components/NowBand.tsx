'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Settings } from 'iconoir-react';
import { RefreshCw } from 'lucide-react';
import { IconAction } from '@/components/data/IconAction';
import type { PomodoroState } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { tabular } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Clock } from './Clock';
import { Pomodoro } from './Pomodoro';

interface Props {
  pomodoro: PomodoroState | null;
  loading: boolean;
  onRefresh: () => void;
  onChanged: () => void;
  bell: ReactNode;
  updatedAt: string | null;
  /** Ações que só existem em certas situações — restaurar a disposição dos
   *  painéis, por exemplo, que só faz sentido depois de alguém mexer. */
  extra?: ReactNode;
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return 'sincronizando';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'sincronizando';
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `atualizado ${h}:${m}`;
}

export function NowBand({
  pomodoro,
  loading,
  onRefresh,
  onChanged,
  bell,
  updatedAt,
  extra,
}: Props) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-line pt-10 pb-8">
      <div className="flex flex-wrap items-end gap-10">
        <Clock />
        <Pomodoro pomodoro={pomodoro} onChanged={onChanged} />
      </div>
      <div className="flex items-center gap-3">
        <span className={cn('type-caption text-ink-dim', tabular)}>
          {formatUpdatedAt(updatedAt)}
        </span>
        <IconAction
          variant="outline"
          label={loading ? 'Atualizando…' : 'Atualizar agora'}
          onClick={onRefresh}
          disabled={loading}
          icon={<RefreshCw className={cn('size-4', loading && 'animate-spin')} />}
        />
        {extra}
        {bell}
        <Button asChild variant="ghost" size="icon-sm">
          <Link href="/config" aria-label="configuração">
            <Settings width={16} height={16} />
          </Link>
        </Button>
      </div>
    </header>
  );
}
