/**
 * Skins: a fourth appearance dimension, beside theme, density and sidebar.
 *
 * A skin is **only** a block of token overrides in `globals.css`. It never
 * forks a component, a screen or a module, and nothing in the app branches on
 * which skin is active. That is the whole contract, and it is what makes the
 * list below cheap to grow: every screen already reads the token layer, so a
 * screen written tomorrow inherits every skin that exists, including the ones
 * added after it.
 *
 * To add one:
 *   1. append an entry here;
 *   2. add a `[data-skin='<id>']` block to `globals.css` overriding tokens.
 * There is no third step. If a skin ever seems to need one, the component is
 * reading a literal where it should be reading a token, and that is the bug.
 */

export type Skin = 'default' | 'relief';

export const SKIN_COOKIE = 'skin';

export interface SkinInfo {
  id: Skin;
  label: string;
  description: string;
}

/** The order here is the order the settings screen offers them. */
export const SKINS: SkinInfo[] = [
  {
    id: 'default',
    label: 'Vidro',
    description:
      'Superfícies translúcidas sobre um fundo iridescente, com sombra curta. É o padrão.',
  },
  {
    id: 'relief',
    label: 'Relevo',
    description:
      'Corpos opacos que saem de um fundo liso, delimitados por um fio de luz em cima e à esquerda e uma sombra caindo do lado oposto.',
  },
];

/** Same three-state shape as the other dimensions: the default is the absence
 *  of everything, so anything unrecognised is the default. */
export function parseSkin(raw: string | undefined): Skin {
  return raw === 'relief' ? 'relief' : 'default';
}

/**
 * Stamps the root element and writes the cookie. Choosing the default deletes
 * the cookie rather than writing the word, so the absence of a cookie and the
 * absence of the attribute always mean the same thing.
 */
export function applySkin(skin: Skin, root: HTMLElement = document.documentElement): void {
  if (skin === 'default') delete root.dataset.skin;
  else root.dataset.skin = skin;

  document.cookie =
    skin === 'default'
      ? `${SKIN_COOKIE}=; path=/; max-age=0; samesite=lax`
      : `${SKIN_COOKIE}=${skin}; path=/; max-age=31536000; samesite=lax`;
}

/** What the root element says right now. The element is the source of truth: a
 *  cookie cleared in another tab would otherwise leave a picker showing a
 *  choice that is no longer applied. */
export function readSkin(root: HTMLElement = document.documentElement): Skin {
  return parseSkin(root.dataset.skin);
}
