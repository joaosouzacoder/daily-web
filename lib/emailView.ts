/**
 * O que a tela do e-mail está mostrando vive na URL: pasta, busca, filtro,
 * ordenação, a mensagem aberta e a tela cheia. Recarregar, voltar e mandar o
 * link para si mesmo precisam cair exatamente no mesmo lugar.
 *
 * Os nomes são prefixados porque o painel divide a URL com o resto do quadro.
 */

export type EmailSort = 'recent' | 'oldest';

export interface EmailViewState {
  /** Caminho da pasta no servidor. Vazio é a caixa de entrada do painel, que
   *  vem pronta do ciclo e não custa uma ida ao servidor. */
  folder: string;
  query: string;
  onlyUnread: boolean;
  /** Id da conta, ou vazio para todas. */
  account: string;
  sort: EmailSort;
  /** Mensagem aberta, na forma "conta:uid". */
  open: string;
  maximized: boolean;
}

export const DEFAULT_EMAIL_VIEW: EmailViewState = {
  folder: '',
  query: '',
  onlyUnread: false,
  account: '',
  sort: 'recent',
  open: '',
  maximized: false,
};

const PREFIX = 'mail_';
const KEYS = {
  folder: `${PREFIX}folder`,
  query: `${PREFIX}q`,
  onlyUnread: `${PREFIX}unread`,
  account: `${PREFIX}account`,
  sort: `${PREFIX}sort`,
  open: `${PREFIX}open`,
  maximized: `${PREFIX}max`,
} as const;

/** A URL é entrada não confiável: um valor fora do que a tela produz cai no
 *  padrão em vez de virar estado. */
const MAX_TEXT = 200;

function text(raw: string | null): string {
  if (!raw) return '';
  return raw.length > MAX_TEXT ? '' : raw;
}

export function parseEmailView(params: URLSearchParams): EmailViewState {
  const sort = params.get(KEYS.sort);
  return {
    folder: text(params.get(KEYS.folder)),
    query: text(params.get(KEYS.query)),
    onlyUnread: params.get(KEYS.onlyUnread) === '1',
    account: text(params.get(KEYS.account)),
    sort: sort === 'oldest' ? 'oldest' : 'recent',
    open: text(params.get(KEYS.open)),
    maximized: params.get(KEYS.maximized) === '1',
  };
}

/**
 * Escreve o estado na URL que já existe, preservando o que não é do e-mail.
 * O valor padrão não vai para a URL — é o que mantém o link limpo.
 */
export function emailViewToParams(
  current: URLSearchParams,
  view: EmailViewState,
): URLSearchParams {
  const params = new URLSearchParams(current);
  const put = (key: string, value: string, padrao: string) => {
    if (value === padrao) params.delete(key);
    else params.set(key, value);
  };

  put(KEYS.folder, view.folder, DEFAULT_EMAIL_VIEW.folder);
  put(KEYS.query, view.query, DEFAULT_EMAIL_VIEW.query);
  put(KEYS.onlyUnread, view.onlyUnread ? '1' : '0', '0');
  put(KEYS.account, view.account, DEFAULT_EMAIL_VIEW.account);
  put(KEYS.sort, view.sort, DEFAULT_EMAIL_VIEW.sort);
  put(KEYS.open, view.open, DEFAULT_EMAIL_VIEW.open);
  put(KEYS.maximized, view.maximized ? '1' : '0', '0');
  return params;
}

/**
 * Mudar de pasta ou abrir a tela cheia é navegação: o botão voltar precisa
 * desfazer. Mexer num filtro não é, e empilhar cada tecla digitada na busca
 * encheria o histórico.
 */
export function isNavigation(anterior: EmailViewState, proximo: EmailViewState): boolean {
  return anterior.folder !== proximo.folder || anterior.maximized !== proximo.maximized;
}
