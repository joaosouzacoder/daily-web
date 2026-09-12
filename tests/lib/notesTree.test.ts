import { describe, expect, it } from 'vitest';
import {
  buildFolderTree,
  depthOf,
  descendantIds,
  folderPath,
  heightOf,
  MAX_FOLDER_DEPTH,
  refuseMove,
} from '@/lib/notesTree';
import type { NoteFolder } from '@/lib/types';

function folder(id: string, parentId: string | null = null, position = 0): NoteFolder {
  return { id, name: id, parentId, position, updatedAt: '2026-09-01T00:00:00.000Z' };
}

/** Uma corrente de pastas, cada uma dentro da anterior. */
function chain(length: number): NoteFolder[] {
  return Array.from({ length }, (_, i) => folder(`n${i}`, i === 0 ? null : `n${i - 1}`));
}

describe('buildFolderTree', () => {
  it('aninha as filhas sob o pai', () => {
    const tree = buildFolderTree([folder('a'), folder('b', 'a'), folder('c', 'b')]);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('a');
    expect(tree[0].children[0].id).toBe('b');
    expect(tree[0].children[0].children[0].id).toBe('c');
  });

  it('marca a profundidade de cada nível', () => {
    const tree = buildFolderTree([folder('a'), folder('b', 'a'), folder('c', 'b')]);

    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it('ordena os irmãos por posição', () => {
    const tree = buildFolderTree([folder('b', null, 2), folder('a', null, 1)]);

    expect(tree.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('sobe para a raiz a pasta cujo pai não existe, em vez de escondê-la', () => {
    const tree = buildFolderTree([folder('a'), folder('orfa', 'sumiu')]);

    expect(tree.map((n) => n.id).sort()).toEqual(['a', 'orfa']);
  });

  it('não entra em laço com um ciclo gravado no banco', () => {
    const tree = buildFolderTree([folder('a', 'b'), folder('b', 'a')]);

    // As duas continuam visíveis: nenhuma nota fica inalcançável.
    const ids = new Set<string>();
    const walk = (list: typeof tree) => list.forEach((n) => (ids.add(n.id), walk(n.children)));
    walk(tree);
    expect([...ids].sort()).toEqual(['a', 'b']);
  });
});

describe('descendantIds', () => {
  it('traz a pasta e tudo que está dentro', () => {
    const folders = [folder('a'), folder('b', 'a'), folder('c', 'b'), folder('d')];

    expect(descendantIds(folders, 'a').sort()).toEqual(['a', 'b', 'c']);
  });

  it('devolve só a própria quando não tem filhas', () => {
    expect(descendantIds([folder('a')], 'a')).toEqual(['a']);
  });

  it('devolve nada para uma pasta que não está na lista', () => {
    expect(descendantIds([folder('a')], 'de-outra-pessoa')).toEqual([]);
  });
});

describe('folderPath', () => {
  it('devolve o caminho da raiz para dentro', () => {
    const folders = [folder('a'), folder('b', 'a')];

    expect(folderPath(folders, 'b')).toEqual(['a', 'b']);
  });

  it('sem pasta, o caminho é vazio', () => {
    expect(folderPath([folder('a')], null)).toEqual([]);
  });
});

describe('refuseMove', () => {
  it('aceita mover para a raiz', () => {
    expect(refuseMove([folder('a'), folder('b', 'a')], 'b', null)).toBeNull();
  });

  it('recusa mover uma pasta para dentro de si mesma', () => {
    expect(refuseMove([folder('a')], 'a', 'a')).toBe('cycle');
  });

  it('recusa mover uma pasta para dentro de uma filha dela', () => {
    const folders = [folder('a'), folder('b', 'a'), folder('c', 'b')];

    expect(refuseMove(folders, 'a', 'c')).toBe('cycle');
  });

  it('recusa um destino que não existe', () => {
    expect(refuseMove([folder('a')], 'a', 'sumiu')).toBe('unknown');
  });

  it('recusa quando o ramo passaria da profundidade máxima', () => {
    const fundo = chain(MAX_FOLDER_DEPTH);
    const solta = folder('extra');

    expect(heightOf(fundo, 'n0')).toBe(MAX_FOLDER_DEPTH);
    expect(depthOf(fundo, `n${MAX_FOLDER_DEPTH - 1}`)).toBe(MAX_FOLDER_DEPTH - 1);
    expect(refuseMove([...fundo, solta], 'extra', `n${MAX_FOLDER_DEPTH - 1}`)).toBe('depth');
  });

  it('aceita quando o ramo ainda cabe', () => {
    const fundo = chain(MAX_FOLDER_DEPTH - 1);
    const solta = folder('extra');

    expect(refuseMove([...fundo, solta], 'extra', `n${MAX_FOLDER_DEPTH - 2}`)).toBeNull();
  });
});
