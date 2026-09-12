import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMAIL_VIEW,
  emailViewToParams,
  isNavigation,
  parseEmailView,
} from '@/lib/emailView';

describe('estado da tela de e-mail na URL', () => {
  it('lê pasta, busca, filtro, ordenação e mensagem aberta', () => {
    const view = parseEmailView(
      new URLSearchParams(
        'mail_folder=Clientes&mail_q=nota&mail_unread=1&mail_sort=oldest&mail_open=mail-1:7&mail_max=1',
      ),
    );

    expect(view).toEqual({
      folder: 'Clientes',
      query: 'nota',
      onlyUnread: true,
      account: '',
      sort: 'oldest',
      open: 'mail-1:7',
      maximized: true,
    });
  });

  it('devolve o padrão quando não há nada na URL', () => {
    expect(parseEmailView(new URLSearchParams(''))).toEqual(DEFAULT_EMAIL_VIEW);
  });

  // A URL é entrada não confiável: ela chega editada à mão, truncada por um
  // aplicativo de mensagem, ou vinda de uma versão anterior da tela.
  it('cai no padrão diante de valor sem sentido', () => {
    const view = parseEmailView(
      new URLSearchParams(`mail_sort=lixo&mail_unread=talvez&mail_q=${'a'.repeat(500)}`),
    );

    expect(view.sort).toBe('recent');
    expect(view.onlyUnread).toBe(false);
    expect(view.query).toBe('');
  });

  // Link limpo: o que é padrão não precisa estar escrito.
  it('não escreve o valor padrão na URL', () => {
    const params = emailViewToParams(new URLSearchParams(''), DEFAULT_EMAIL_VIEW);
    expect(params.toString()).toBe('');
  });

  it('escreve só o que saiu do padrão', () => {
    const params = emailViewToParams(new URLSearchParams(''), {
      ...DEFAULT_EMAIL_VIEW,
      folder: 'Clientes',
      onlyUnread: true,
    });

    expect(params.get('mail_folder')).toBe('Clientes');
    expect(params.get('mail_unread')).toBe('1');
    expect(params.get('mail_sort')).toBeNull();
  });

  // A URL é dividida com o resto do quadro: o painel não pode apagar o que
  // não é dele.
  it('preserva os parâmetros de outros painéis', () => {
    const params = emailViewToParams(new URLSearchParams('jira_tab=problemas'), {
      ...DEFAULT_EMAIL_VIEW,
      query: 'nota',
    });

    expect(params.get('jira_tab')).toBe('problemas');
    expect(params.get('mail_q')).toBe('nota');
  });

  it('ida e volta preserva o estado', () => {
    const view = {
      ...DEFAULT_EMAIL_VIEW,
      folder: '[Gmail]/Importante',
      query: 'contrato',
      onlyUnread: true,
      account: 'mail-2',
      sort: 'oldest' as const,
      open: 'mail-2:19',
      maximized: true,
    };

    expect(parseEmailView(emailViewToParams(new URLSearchParams(''), view))).toEqual(view);
  });
});

describe('o que empilha no histórico', () => {
  // Trocar de pasta e abrir a tela cheia são navegação: o voltar desfaz.
  it('conta mudança de pasta e de tela cheia como navegação', () => {
    expect(isNavigation(DEFAULT_EMAIL_VIEW, { ...DEFAULT_EMAIL_VIEW, folder: 'X' })).toBe(true);
    expect(isNavigation(DEFAULT_EMAIL_VIEW, { ...DEFAULT_EMAIL_VIEW, maximized: true })).toBe(true);
  });

  // Empilhar cada tecla digitada na busca encheria o histórico.
  it('não conta filtro nem ordenação como navegação', () => {
    expect(isNavigation(DEFAULT_EMAIL_VIEW, { ...DEFAULT_EMAIL_VIEW, query: 'a' })).toBe(false);
    expect(isNavigation(DEFAULT_EMAIL_VIEW, { ...DEFAULT_EMAIL_VIEW, onlyUnread: true })).toBe(false);
    expect(isNavigation(DEFAULT_EMAIL_VIEW, { ...DEFAULT_EMAIL_VIEW, sort: 'oldest' })).toBe(false);
  });
});
