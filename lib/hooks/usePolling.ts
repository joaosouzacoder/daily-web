'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardState } from '@/lib/types';

const POLL_INTERVAL_MS = 20_000;

export function useDashboardState() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/state');
    if (!res.ok) return;
    const data: DashboardState = await res.json();
    if (mounted.current) setState(data);
  }, []);

  const refreshNow = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      if (res.ok) {
        const data: DashboardState = await res.json();
        if (mounted.current) setState(data);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, [load]);

  return { state, loading, refreshNow, reload: load };
}
