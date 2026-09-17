import type { ReactNode } from 'react';

/**
 * A visible keyboard-shortcut badge, e.g. inside a button ("Excluir" + this)
 * or standalone next to a hint ("E" + "excluir"). `aria-hidden` so it never
 * changes a button's accessible name — a screen reader already has its own
 * way to know what Enter or Escape does.
 */
export function ShortcutKey({ children }: { children: ReactNode }) {
  return (
    <kbd
      aria-hidden="true"
      className="rounded-full border border-current/30 px-1.5 py-0.5 text-[10px] font-normal opacity-70"
    >
      {children}
    </kbd>
  );
}
