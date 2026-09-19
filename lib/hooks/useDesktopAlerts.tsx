'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { currentAlerts, diffAlerts, dueReminders, summarize } from '@/lib/desktopAlerts';
import { isEnabled, loadSeen, saveSeen, setEnabled } from '@/lib/desktopAlertsStorage';
import type { DashboardState } from '@/lib/types';

interface DesktopAlertsControl {
  supported: boolean;
  enabled: boolean;
  permission: NotificationPermission | 'unsupported';
  enable(): Promise<void>;
  disable(): void;
}

export function useDesktopAlerts(state: DashboardState | null): DesktopAlertsControl {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [enabled, setEnabledState] = useState(() => isEnabled());
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    supported ? Notification.permission : 'unsupported',
  );
  const stateRef = useRef(state);
  const enabledRef = useRef(enabled);
  const permissionRef = useRef(permission);
  stateRef.current = state;
  enabledRef.current = enabled;
  permissionRef.current = permission;

  const show = useCallback((alerts: ReturnType<typeof summarize>) => {
    if (!enabledRef.current || permissionRef.current !== 'granted') return;
    for (const alert of summarize(alerts)) {
      try {
        const notification = new Notification(alert.title, { body: alert.body, tag: alert.tag });
        notification.onclick = () => {
          window.focus();
          if (alert.url) window.open(alert.url, '_blank', 'noopener');
          notification.close();
        };
      } catch {
        // Alguns navegadores expõem a API fora de um contexto onde podem criar o aviso.
      }
    }
  }, []);

  const checkReminders = useCallback(() => {
    if (!stateRef.current) return;
    const agenda = stateRef.current.agenda.data ?? [];
    const result = dueReminders(agenda, new Date(), loadSeen());
    saveSeen(result.seen);
    show(result.alerts);
  }, [show]);

  useEffect(() => {
    if (!state) return;
    const result = diffAlerts(loadSeen(), currentAlerts(state));
    saveSeen(result.seen);
    show(result.alerts);
    checkReminders();
  }, [state?.updatedAt, checkReminders, show]);

  useEffect(() => {
    const interval = setInterval(checkReminders, 30_000);
    return () => clearInterval(interval);
  }, [checkReminders]);

  const enable = useCallback(async () => {
    if (!supported) return;
    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);
    if (nextPermission !== 'granted') return;
    setEnabled(true);
    setEnabledState(true);
  }, [supported]);

  const disable = useCallback(() => {
    setEnabled(false);
    setEnabledState(false);
  }, []);

  return { supported, enabled, permission, enable, disable };
}
