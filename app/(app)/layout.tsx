import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { getCurrentUser } from '@/lib/auth/currentUser';
import {
  DENSITY_COOKIE,
  SIDEBAR_COOKIE,
  THEME_COOKIE,
  parseDensity,
  parseSidebar,
  parseTheme,
} from '@/lib/theme';

/**
 * Wraps the authenticated screens only. /login sits outside this group on
 * purpose: it has nothing to navigate to and no account to act on.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const user = await getCurrentUser();

  return (
    <AppShell
      theme={parseTheme(jar.get(THEME_COOKIE)?.value)}
      density={parseDensity(jar.get(DENSITY_COOKIE)?.value)}
      sidebar={parseSidebar(jar.get(SIDEBAR_COOKIE)?.value)}
      username={user?.username ?? null}
    >
      {children}
    </AppShell>
  );
}
