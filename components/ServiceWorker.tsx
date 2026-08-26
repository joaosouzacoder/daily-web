'use client';

import { useEffect } from 'react';

/** Registra o service worker que habilita o "Instalar" do Chrome. Falhar aqui
 *  não afeta a app: sem service worker ela continua funcionando como site. */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Contexto inseguro (http fora de localhost) ou registro bloqueado.
    });
  }, []);

  return null;
}
