'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDashboardPanels } from '@/components/dashboard/useDashboardPanels';
import { useShellUser } from '@/components/shell/ShellUser';
import { NowBand } from '@/components/NowBand';
import { FocusBlockProvider } from '@/components/FocusBlockProvider';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HomeViewSwitch } from '@/components/dashboard/HomeViewSwitch';
import { WorkspaceHome, clearWorkspaceLayout } from '@/components/dashboard/WorkspaceHome';
import type { HomeView } from '@/lib/types';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { Button } from '@/components/ui/button';
import { Plug, RotateCcw } from 'lucide-react';
import {
  defaultLayout,
  nearestLayout,
  type PanelPlacement,
  type SizedLayout,
} from '@/lib/dashboardLayout';

export default function DashboardPage() {
  const { state, reload, mutate, nothingOn, panels } = useDashboardPanels();
  const { greetingName, welcome } = useShellUser();
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  // A cached state from before this preference existed has no homeView.
  const view: HomeView = state?.homeView ?? 'grid';
  const [workspaceGeneration, setWorkspaceGeneration] = useState(0);
  const layouts = (state?.layouts as SizedLayout[] | undefined) ?? [];
  const legado = (state?.layout as PanelPlacement[] | undefined) ?? defaultLayout();

  // A escolha da disposição é do cliente: só ele sabe o tamanho da janela.
  // Enquanto não houver gravação por tamanho, vale a disposição única antiga.
  const [janela, setJanela] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const medir = () => setJanela({ width: window.innerWidth, height: window.innerHeight });
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  // Sem a medida não há disposição: a grade montaria com a antiga e trocaria
  // logo depois. Na volta para a tela inicial o estado já está carregado, e
  // essa troca aparecia como os painéis perdendo o lugar.
  const layout = useMemo(() => {
    if (!janela) return null;
    return nearestLayout(layouts, janela.width, janela.height)?.layout ?? legado;
  }, [layouts, legado, janela]);

  // A disposição é gravada para o tamanho de janela de agora, e só quando a
  // pessoa pede: arrastar não grava nada.
  const saveLayout = useCallback(
    async (next: PanelPlacement[]) => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: next, viewport }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLayoutError(data.error ?? 'Falha ao guardar a disposição dos painéis');
        reload();
        return;
      }
      setLayoutError(null);
      const { layouts: gravados } = (await res.json()) as { layouts: SizedLayout[] };
      mutate((s) => ({ ...s, layouts: gravados }));
    },
    [mutate, reload],
  );

  // The switch answers at once; the server only remembers the choice, and a
  // failure says so and brings back what is saved.
  const chooseView = useCallback(
    async (next: HomeView) => {
      if (next === view) return;
      mutate((s) => ({ ...s, homeView: next }));
      setViewError(null);
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeView: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setViewError(data.error ?? 'Falha ao guardar a disposição do Início');
        reload();
      }
    },
    [view, mutate, reload],
  );

  const resetWorkspace = () => {
    clearWorkspaceLayout();
    setWorkspaceGeneration((g) => g + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <NowBand
        greetingName={greetingName}
        welcome={welcome}
        pomodoro={state?.pomodoro ?? null}
        onChanged={reload}
      />

      {layoutError && <ErrorState title="Não deu para guardar a disposição" description={layoutError} />}
      {viewError && <ErrorState title="Não deu para trocar a disposição" description={viewError} />}

      {state !== null && !nothingOn && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <HomeViewSwitch view={view} onChange={(next) => void chooseView(next)} />
          {view === 'workspace' && (
            <Button variant="outline" size="sm" onClick={resetWorkspace}>
              <RotateCcw className="size-4" />
              Restaurar abas
            </Button>
          )}
        </div>
      )}

      {nothingOn ? (
        <EmptyState
          icon={<Plug />}
          title="Nenhum módulo ligado ainda"
          description="Conecte seu e-mail, agenda, Jira ou GitHub para o painel começar a mostrar alguma coisa. Cada um é opcional e leva menos de um minuto."
          action={
            <Button asChild variant="glow">
              <Link href="/tools">Conectar minhas contas</Link>
            </Button>
          }
        />
      ) : view === 'workspace' ? (
        state !== null && (
          <FocusBlockProvider calendars={state.agendaCalendars ?? []} onCreated={reload}>
            <WorkspaceHome panels={panels} generation={workspaceGeneration} />
          </FocusBlockProvider>
        )
      ) : layout === null ? null : (
        <FocusBlockProvider calendars={state?.agendaCalendars ?? []} onCreated={reload}>
          <DashboardGrid layout={layout} panels={panels} onSave={saveLayout} />
        </FocusBlockProvider>
      )}
    </div>
  );
}
