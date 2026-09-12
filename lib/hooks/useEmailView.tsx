'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_EMAIL_VIEW,
  emailViewToParams,
  isNavigation,
  parseEmailView,
  type EmailViewState,
} from '@/lib/emailView';

/**
 * O estado da tela do e-mail, lido da URL e escrito nela.
 *
 * A URL é a fonte da verdade: este estado é uma cópia do que está lá, refeita
 * a cada mudança de endereço — inclusive a que vem do botão voltar.
 *
 * A escrita usa o histórico do navegador em vez do roteador para não pedir
 * uma nova renderização do quadro inteiro por causa de uma tecla digitada na
 * busca de um painel.
 */
export function useEmailView(): [EmailViewState, (next: Partial<EmailViewState>) => void] {
  const [view, setView] = useState<EmailViewState>(DEFAULT_EMAIL_VIEW);

  // O primeiro desenho acontece no servidor, onde não há URL de navegador: o
  // estado real entra depois que a tela monta, e o voltar o traz de novo.
  useEffect(() => {
    const ler = () => setView(parseEmailView(new URLSearchParams(window.location.search)));
    ler();
    window.addEventListener('popstate', ler);
    return () => window.removeEventListener('popstate', ler);
  }, []);

  const update = useCallback((next: Partial<EmailViewState>) => {
    setView((atual) => {
      const proximo = { ...atual, ...next };
      const params = emailViewToParams(new URLSearchParams(window.location.search), proximo);
      const busca = params.toString();
      const url = `${window.location.pathname}${busca ? `?${busca}` : ''}`;
      // Trocar de pasta é navegação e o voltar precisa desfazer; mexer num
      // filtro não é, e empilhar cada tecla digitada encheria o histórico.
      if (isNavigation(atual, proximo)) window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
      return proximo;
    });
  }, []);

  return [view, update];
}
