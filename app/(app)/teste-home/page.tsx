'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Workspace, ViewType, layout as L, type WorkspaceHandle } from '@danfessler/trellis-react';
import '@danfessler/trellis/style.css';
import { useDashboardPanels, type DashboardPanel } from '@/components/dashboard/useDashboardPanels';
import { FocusBlockProvider } from '@/components/FocusBlockProvider';
import { EmptyState } from '@/components/data/EmptyState';
import { PageHeader } from '@/components/data/PageHeader';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'daily-web:teste-home';
// Bump when the default arrangement or the view ids change: Trellis then
// discards the layouts saved in each browser instead of restoring stale ones.
const LAYOUT_VERSION = 1;

const TITLES: Record<string, string> = {
  email: 'E-mail',
  tasks: 'Tarefas',
  notes: 'Notas',
  agenda: 'Agenda',
  jira: 'Jira',
  pulls: 'GitHub',
  slack: 'Slack',
};

type WorkspaceTheme = 'light' | 'dark' | 'system';

/** Follows the app's own theme: an explicit class on <html>, or the system's. */
function useWorkspaceTheme(): WorkspaceTheme {
  const [theme, setTheme] = useState<WorkspaceTheme>('system');
  useEffect(() => {
    const root = document.documentElement;
    const read = () =>
      setTheme(root.classList.contains('dark') ? 'dark' : root.classList.contains('light') ? 'light' : 'system');
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/** Two columns, the panels shared between them in the home page's order. */
function defaultLayoutFor(panels: DashboardPanel[]) {
  const views = panels.map((p) => L.view(p.id, { id: p.id }));
  if (views.length === 1) return views[0];
  const half = Math.ceil(views.length / 2);
  return L.row([L.column(views.slice(0, half)), L.column(views.slice(half))], [3, 2]);
}

export default function TesteHomePage() {
  const { state, reload, nothingOn, panels } = useDashboardPanels();
  const theme = useWorkspaceTheme();
  // Remounting the workspace is how a reset takes effect: Trellis reads the
  // saved layout and the default only once, when it mounts.
  const [generation, setGeneration] = useState(0);
  const panelIds = panels.map((p) => p.id).join(',');
  // The default is built once per set of modules; the panels' content changes
  // on every poll and must not rebuild it.
  const defaultLayout = useMemo(
    () => defaultLayoutFor(panelIds.split(',').map((id) => ({ id, node: null }))),
    [panelIds],
  );

  // A layout saved before a module was turned on has no view for it. Open the
  // missing ones; a view the person hid is still in the snapshot and stays hidden.
  const openMissing = useCallback(
    (ws: WorkspaceHandle | null) => {
      if (!ws) return;
      const snapshot = ws.getSnapshot();
      const present = new Set([
        ...snapshot.views.map((v) => v.type),
        ...snapshot.hidden.flatMap((h) => h.views.map((v) => v.type)),
      ]);
      for (const id of panelIds.split(',')) {
        if (id && !present.has(id)) ws.open(id, { id, focus: false });
      }
    },
    [panelIds],
  );

  const reset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage blocked: the remount still falls back to the default.
    }
    setGeneration((g) => g + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Teste Home"
        description="Os mesmos painéis do Início num espaço de trabalho do Trellis: arraste as abas para dividir, agrupar ou soltar um painel. A disposição fica salva neste navegador."
        action={
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="size-4" />
            Restaurar disposição
          </Button>
        }
      />

      {nothingOn ? (
        <EmptyState
          title="Nenhum módulo ligado ainda"
          description="Ligue um módulo em Ferramentas para ele aparecer aqui."
        />
      ) : state === null ? null : (
        <FocusBlockProvider calendars={state.agendaCalendars ?? []} onCreated={reload}>
          <div className="h-[calc(100dvh-12rem)] min-h-[480px] overflow-hidden rounded-xl border">
            <Workspace
              key={`${generation}:${panelIds}`}
              ref={openMissing}
              theme={theme}
              storageKey={STORAGE_KEY}
              version={LAYOUT_VERSION}
              defaultLayout={defaultLayout}
              // A module turned off since the layout was saved just disappears.
              onMissingType={() => 'drop'}
              label="Painéis da Teste Home"
            >
              {panels.map((panel) => (
                <ViewType key={panel.id} id={panel.id} title={TITLES[panel.id] ?? panel.id} singleton closable={false}>
                  <div className="h-full overflow-auto p-2">{panel.node}</div>
                </ViewType>
              ))}
            </Workspace>
          </div>
        </FocusBlockProvider>
      )}
    </div>
  );
}
