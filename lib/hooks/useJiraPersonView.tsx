import { useState, useEffect } from 'react';
import type { JiraPersonView } from '@/lib/types';

export function useJiraPersonView(accountId: string | null, refreshedAt: string | null) {
  const [cache, setCache] = useState<Map<string, JiraPersonView>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) {
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetch(`/api/jira/people/${encodeURIComponent(accountId)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Erro ${res.status}`);
        }
        return res.json();
      })
      .then((data: JiraPersonView) => {
        if (!active) return;
        setCache((prev) => {
          const next = new Map(prev);
          next.set(accountId, data);
          return next;
        });
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accountId, refreshedAt]);

  if (!accountId) {
    return { view: null, loading: false, error: null };
  }

  return {
    view: cache.get(accountId) ?? null,
    loading,
    error,
  };
}
