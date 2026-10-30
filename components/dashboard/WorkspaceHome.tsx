'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Workspace, ViewType, layout as L, type WorkspaceHandle } from '@danfessler/trellis-react';
import '@danfessler/trellis/style.css';
import type { DashboardPanel } from '@/components/dashboard/useDashboardPanels';
import { PanelFrame } from '@/components/data/Panel';

// Named after the Teste Home page where this view was first tried: renaming it
// would drop the arrangements already saved in those browsers.
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

/** Forgets this browser's arrangement. It takes effect on the next mount. */
export function clearWorkspaceLayout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the remount still falls back to the default.
  }
}

interface Props {
  panels: DashboardPanel[];
  /** Changing it remounts the workspace: Trellis reads the saved layout and
   *  the default only once, when it mounts. */
  generation: number;
}

/**
 * The home panels as tabs in a Trellis workspace, the alternative to the grid.
 * The arrangement is saved per browser in localStorage.
 */
export function WorkspaceHome({ panels, generation }: Props) {
  const theme = useWorkspaceTheme();
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

  return (
    <div className="home-workspace h-[calc(100dvh-14rem)] min-h-[480px]">
      <Workspace
        key={`${generation}:${panelIds}`}
        ref={openMissing}
        theme={theme}
        storageKey={STORAGE_KEY}
        version={LAYOUT_VERSION}
        defaultLayout={defaultLayout}
        // A module turned off since the layout was saved just disappears.
        onMissingType={() => 'drop'}
        label="Painéis do Início"
      >
        {panels.map((panel) => (
          <ViewType key={panel.id} id={panel.id} title={TITLES[panel.id] ?? panel.id} singleton closable={false}>
            {/* Framed like the grid's panels: the tab is the card, so the panel
                drops its own and the two do not stack. */}
            <div className="flex h-full min-w-0 flex-col overflow-hidden">
              <PanelFrame>{panel.node}</PanelFrame>
            </div>
          </ViewType>
        ))}
      </Workspace>
    </div>
  );
}
