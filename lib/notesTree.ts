import type { NoteFolder, NoteFolderNode } from './types';

/** Uma pasta dentro de outra dentro de outra ainda se lê na barra lateral;
 *  mais fundo que isto a indentação come a largura e ninguém acha nada. */
export const MAX_FOLDER_DEPTH = 5;
/** Teto de pastas por pessoa. A árvore é lida inteira a cada abertura do
 *  painel — sem teto, uma conta pode crescer até a leitura doer. */
export const MAX_FOLDERS = 100;
export const MAX_FOLDER_NAME_LENGTH = 60;

/** As pastas soltas ("Sem pasta") e a raiz da árvore usam este id na tela.
 *  No banco a nota sem pasta guarda NULL. */
export const NO_FOLDER = '__none__';

/**
 * Monta a hierarquia a partir da lista plana. Uma pasta cujo pai não está na
 * lista — ou que aponta para si mesma por um caminho qualquer — sobe para a
 * raiz em vez de sumir: perder a pasta de vista é pior que mostrá-la fora do
 * lugar, e nenhuma nota fica inalcançável.
 */
export function buildFolderTree(folders: NoteFolder[]): NoteFolderNode[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const nodes = new Map<string, NoteFolderNode>(
    folders.map((f) => [f.id, { ...f, depth: 0, children: [] }]),
  );

  const roots: NoteFolderNode[] = [];
  for (const folder of folders) {
    const node = nodes.get(folder.id)!;
    const parent =
      folder.parentId && byId.has(folder.parentId) && !isAncestor(byId, folder.id, folder.parentId)
        ? nodes.get(folder.parentId)!
        : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const stamp = (list: NoteFolderNode[], depth: number) => {
    list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    for (const node of list) {
      node.depth = depth;
      stamp(node.children, depth + 1);
    }
  };
  stamp(roots, 0);
  return roots;
}

/** `candidate` está abaixo de `id` na árvore? Anda para cima a partir do
 *  candidato, com um teto de passos para um ciclo no banco não travar aqui. */
function isAncestor(byId: Map<string, NoteFolder>, id: string, candidate: string): boolean {
  let current: string | null = candidate;
  for (let step = 0; step <= byId.size && current; step += 1) {
    if (current === id) return true;
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

/** Os ids da pasta e de tudo que está dentro dela, em qualquer profundidade.
 *  Um id que não está na lista devolve nada — quem chama distingue assim a
 *  pasta vazia da pasta que não existe (ou não é de quem perguntou). */
export function descendantIds(folders: NoteFolder[], id: string): string[] {
  if (!folders.some((f) => f.id === id)) return [];
  const byParent = new Map<string | null, NoteFolder[]>();
  for (const folder of folders) {
    const list = byParent.get(folder.parentId) ?? [];
    list.push(folder);
    byParent.set(folder.parentId, list);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (folderId: string) => {
    if (seen.has(folderId)) return;
    seen.add(folderId);
    out.push(folderId);
    for (const child of byParent.get(folderId) ?? []) walk(child.id);
  };
  walk(id);
  return out;
}

/** O caminho legível até a pasta, da raiz para dentro: ["Trabalho", "Clientes"]. */
export function folderPath(folders: NoteFolder[], id: string | null): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  let current = id;
  for (let step = 0; step < byId.size && current; step += 1) {
    const folder = byId.get(current);
    if (!folder) break;
    names.unshift(folder.name);
    current = folder.parentId;
  }
  return names;
}

/** A profundidade da pasta na árvore. A raiz é 0. */
export function depthOf(folders: NoteFolder[], id: string | null): number {
  return folderPath(folders, id).length === 0 ? 0 : folderPath(folders, id).length - 1;
}

/** A altura da subárvore: 1 para uma pasta sem filhas. `seen` fecha o ramo
 *  já visitado — um ciclo gravado no banco não pode virar recursão infinita. */
export function heightOf(folders: NoteFolder[], id: string, seen = new Set<string>()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  const children = folders.filter((f) => f.parentId === id);
  if (children.length === 0) return 1;
  return 1 + Math.max(...children.map((child) => heightOf(folders, child.id, seen)));
}

export type MoveRefusal = 'unknown' | 'cycle' | 'depth';

/**
 * Pode mover `id` para dentro de `parentId`? Devolve null quando pode, e o
 * motivo quando não: a pasta sumiu, o destino está dentro dela (o que
 * arrancaria o ramo da árvore) ou o ramo não cabe na profundidade máxima.
 */
export function refuseMove(
  folders: NoteFolder[],
  id: string,
  parentId: string | null,
): MoveRefusal | null {
  const byId = new Map(folders.map((f) => [f.id, f]));
  if (!byId.has(id)) return 'unknown';
  if (parentId === null) {
    return heightOf(folders, id) > MAX_FOLDER_DEPTH ? 'depth' : null;
  }
  if (!byId.has(parentId)) return 'unknown';
  if (descendantIds(folders, id).includes(parentId)) return 'cycle';
  if (depthOf(folders, parentId) + 1 + heightOf(folders, id) > MAX_FOLDER_DEPTH) return 'depth';
  return null;
}
