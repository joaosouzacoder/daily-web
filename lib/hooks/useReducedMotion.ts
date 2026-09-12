'use client';

import { useEffect, useState } from 'react';

const CONSULTA = '(prefers-reduced-motion: reduce)';

/**
 * Se a pessoa pediu menos movimento no sistema.
 *
 * As classes `motion-reduce:` do Tailwind não alcançam um `transform` escrito
 * no atributo `style`: elas mexem em `translate` e `scale`, que são outras
 * propriedades. Quando o deslocamento é calculado em JavaScript, é aqui que
 * ele precisa ser desligado.
 */
export function useReducedMotion(): boolean {
  // Começa em falso: o servidor não sabe a preferência, e assumir o contrário
  // faria a tela piscar de um estado para o outro na primeira pintura.
  const [reduzido, setReduzido] = useState(false);

  useEffect(() => {
    // `matchMedia` não existe em todo ambiente que renderiza este componente
    // — o dos testes é um deles. Sem ele, vale o padrão: com movimento.
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(CONSULTA);
    const ler = () => setReduzido(media.matches);
    ler();
    media.addEventListener('change', ler);
    return () => media.removeEventListener('change', ler);
  }, []);

  return reduzido;
}
