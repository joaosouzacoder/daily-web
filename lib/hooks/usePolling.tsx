'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardState } from '@/lib/types';

const POLL_INTERVAL_MS = 20_000;

export function useDashboardState() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  // Uma resposta lenta que chega depois de uma ação sobrescreveria o que o
  // usuário acabou de fazer. Cada leitura recebe um número; só a mais recente
  // pode escrever no estado.
  const geracao = useRef(0);

  const aplicar = useCallback((data: DashboardState, minha: number) => {
    if (!mounted.current || minha !== geracao.current) return;
    setState(data);
  }, []);

  const load = useCallback(async () => {
    const minha = (geracao.current += 1);
    const res = await fetch('/api/state');
    if (!res.ok) return;
    aplicar(await res.json(), minha);
  }, [aplicar]);

  const refreshNow = useCallback(async () => {
    setLoading(true);
    const minha = (geracao.current += 1);
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      if (res.ok) aplicar(await res.json(), minha);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [aplicar]);

  /**
   * Aplica uma mudança na hora, antes de o servidor responder — é o que faz a
   * ação parecer imediata. O servidor corrige o próprio cache logo depois, e
   * a próxima leitura confirma. Se a requisição falhar, quem chamou desfaz
   * chamando `reload`.
   *
   * Invalida as leituras em voo: uma resposta pedida antes desta mudança
   * carrega o estado anterior e desfaria o que acabou de acontecer.
   */
  const mutate = useCallback((patch: (state: DashboardState) => DashboardState) => {
    geracao.current += 1;
    setState((atual) => (atual ? patch(atual) : atual));
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

  return { state, loading, refreshNow, reload: load, mutate };
}
