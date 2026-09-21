'use client';

import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  GitPullRequest,
  ListChecks,
  Mail,
  MessageSquare,
  NotebookPen,
  SquareKanban,
} from 'lucide-react';
import { MODULES, type ModuleId } from '@/lib/modules';
import { focusRing } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface Props {
  modules: ModuleId[];
  active: ModuleId;
  onChange: (id: ModuleId) => void;
}

const MODULE_ICON: Record<ModuleId, LucideIcon> = {
  email: Mail,
  tasks: ListChecks,
  notes: NotebookPen,
  agenda: CalendarDays,
  jira: SquareKanban,
  pulls: GitPullRequest,
  slack: MessageSquare,
};

export function MobileModuleNav({ modules, active, onChange }: Props) {
  return (
    <nav
      aria-label="módulos"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-glass-strong pb-[env(safe-area-inset-bottom)] shadow-e4 backdrop-blur-xl backdrop-saturate-150"
    >
      <div className="flex">
        {modules.map((id) => {
          const Icon = MODULE_ICON[id];
          const label = MODULES[id].label;
          const selected = id === active;
          return (
            <button
              key={id}
              type="button"
              aria-label={label}
              title={label}
              aria-current={selected ? 'page' : undefined}
              onClick={() => onChange(id)}
              className={cn(
                'relative flex min-h-12 flex-1 items-center justify-center transition-colors duration-100 ease-brand motion-reduce:transition-none',
                focusRing,
                selected ? 'text-brand' : 'text-ink-dim',
              )}
            >
              {selected && (
                <span
                  aria-hidden
                  className="absolute top-1 h-0.5 w-6 rounded-full bg-brand"
                />
              )}
              <Icon className="size-6" />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
