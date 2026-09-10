import { LayoutDashboard, Settings2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group?: string;
}

/** Flat on purpose: no nesting, no collapsible sections. */
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Painel', icon: LayoutDashboard },
  { href: '/config', label: 'Configuração', icon: Settings2, group: 'Ajustes' },
];

/** A group heading appears only at a boundary, never above every item. */
export function groupStart(items: NavItem[], i: number): boolean {
  return !!items[i]?.group && items[i]?.group !== items[i - 1]?.group;
}
