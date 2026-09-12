import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let dir: string;
const USER = 'u-1';
const OUTRO = 'u-2';

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-folders-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  const { getDb } = await import('@/lib/db');
  getDb();
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('pastas de notas', () => {
  it('começa sem pasta nenhuma', async () => {
    const { listFolders } = await import('@/lib/noteFolders');
    expect(listFolders(USER)).toEqual([]);
  });

  it('cria uma pasta na raiz e uma subpasta', async () => {
    const { createFolder, listFolders } = await import('@/lib/noteFolders');
    const pai = createFolder(USER, 'Trabalho');
    const filha = createFolder(USER, 'Clientes', pai.id);

    expect(filha.parentId).toBe(pai.id);
    expect(listFolders(USER)).toHaveLength(2);
  });

  it('recusa nome vazio', async () => {
    const { createFolder } = await import('@/lib/noteFolders');
    expect(() => createFolder(USER, '   ')).toThrow(/nome/);
  });

  it('recusa criar dentro de uma pasta que não é do usuário', async () => {
    const { createFolder } = await import('@/lib/noteFolders');
    const alheia = createFolder(OUTRO, 'Deles');

    expect(() => createFolder(USER, 'Minha', alheia.id)).toThrow(/não encontrada/);
  });

  it('renomeia', async () => {
    const { createFolder, renameFolder } = await import('@/lib/noteFolders');
    const pasta = createFolder(USER, 'Trabalho');

    expect(renameFolder(USER, pasta.id, ' Projetos ')?.name).toBe('Projetos');
  });

  it('não renomeia a pasta de outra pessoa', async () => {
    const { createFolder, renameFolder } = await import('@/lib/noteFolders');
    const alheia = createFolder(OUTRO, 'Deles');

    expect(renameFolder(USER, alheia.id, 'Minha')).toBeNull();
    expect(renameFolder(OUTRO, alheia.id, 'Deles')?.name).toBe('Deles');
  });

  it('move uma pasta para dentro de outra', async () => {
    const { createFolder, moveFolder } = await import('@/lib/noteFolders');
    const a = createFolder(USER, 'A');
    const b = createFolder(USER, 'B');

    expect(moveFolder(USER, b.id, a.id).parentId).toBe(a.id);
    expect(moveFolder(USER, b.id, null).parentId).toBeNull();
  });

  it('recusa mover uma pasta para dentro de uma filha', async () => {
    const { createFolder, moveFolder, FolderMoveError } = await import('@/lib/noteFolders');
    const pai = createFolder(USER, 'Pai');
    const filha = createFolder(USER, 'Filha', pai.id);

    expect(() => moveFolder(USER, pai.id, filha.id)).toThrow(FolderMoveError);
  });

  it('move a nota entre pastas e para fora de qualquer pasta', async () => {
    const { createNote, moveNote } = await import('@/lib/notes');
    const { createFolder } = await import('@/lib/noteFolders');
    const pasta = createFolder(USER, 'Trabalho');
    const nota = createNote(USER, 'Ideias');

    expect(nota.folderId).toBeNull();
    expect(moveNote(USER, nota.id, pasta.id)?.folderId).toBe(pasta.id);
    expect(moveNote(USER, nota.id, null)?.folderId).toBeNull();
  });

  it('não move a nota para a pasta de outra pessoa', async () => {
    const { createNote, moveNote } = await import('@/lib/notes');
    const { createFolder } = await import('@/lib/noteFolders');
    const alheia = createFolder(OUTRO, 'Deles');
    const nota = createNote(USER, 'Ideias');

    expect(() => moveNote(USER, nota.id, alheia.id)).toThrow(/pasta não encontrada/);
  });

  it('apagar a pasta apaga as subpastas e manda as notas para "Sem pasta"', async () => {
    const { createNote, moveNote, listNotes } = await import('@/lib/notes');
    const { createFolder, deleteFolder, listFolders } = await import('@/lib/noteFolders');
    const pai = createFolder(USER, 'Pai');
    const filha = createFolder(USER, 'Filha', pai.id);
    const nota = createNote(USER, 'Ideias');
    moveNote(USER, nota.id, filha.id);

    expect(deleteFolder(USER, pai.id)).toBe(true);
    expect(listFolders(USER)).toEqual([]);
    const restante = listNotes(USER);
    expect(restante).toHaveLength(1);
    expect(restante[0].folderId).toBeNull();
    expect(restante[0].title).toBe('Ideias');
  });

  it('apagar a pasta não toca nas notas de fora dela', async () => {
    const { createNote, moveNote, listNotes } = await import('@/lib/notes');
    const { createFolder, deleteFolder } = await import('@/lib/noteFolders');
    const alvo = createFolder(USER, 'Alvo');
    const outra = createFolder(USER, 'Outra');
    const dentro = createNote(USER, 'dentro');
    const fora = createNote(USER, 'fora');
    moveNote(USER, dentro.id, alvo.id);
    moveNote(USER, fora.id, outra.id);

    deleteFolder(USER, alvo.id);

    const porTitulo = new Map(listNotes(USER).map((n) => [n.title, n.folderId]));
    expect(porTitulo.get('dentro')).toBeNull();
    expect(porTitulo.get('fora')).toBe(outra.id);
  });

  it('não apaga a pasta de outra pessoa', async () => {
    const { createFolder, deleteFolder, listFolders } = await import('@/lib/noteFolders');
    const alheia = createFolder(OUTRO, 'Deles');

    expect(deleteFolder(USER, alheia.id)).toBe(false);
    expect(listFolders(OUTRO)).toHaveLength(1);
  });

  it('a pasta que nunca subiu ao Drive não deixa exclusão pendente', async () => {
    const { createFolder, deleteFolder, pendingFolderDeletions } = await import(
      '@/lib/noteFolders'
    );
    const pasta = createFolder(USER, 'Trabalho');
    deleteFolder(USER, pasta.id);

    expect(pendingFolderDeletions(USER)).toEqual([]);
  });

  it('a pasta que já subiu fica pendente de exclusão até o Drive ser limpo', async () => {
    const { createFolder, deleteFolder, markFolderSynced, pendingFolderDeletions, clearFolderDeletion } =
      await import('@/lib/noteFolders');
    const pasta = createFolder(USER, 'Trabalho');
    markFolderSynced(USER, pasta.id, 1);
    deleteFolder(USER, pasta.id);

    expect(pendingFolderDeletions(USER)).toEqual([pasta.id]);
    clearFolderDeletion(USER, pasta.id);
    expect(pendingFolderDeletions(USER)).toEqual([]);
  });

  it('as pastas pendentes saem das de fora para as de dentro', async () => {
    const { createFolder, pendingFolders } = await import('@/lib/noteFolders');
    const pai = createFolder(USER, 'Pai');
    const filha = createFolder(USER, 'Filha', pai.id);
    const neta = createFolder(USER, 'Neta', filha.id);

    expect(pendingFolders(USER).map((f) => f.id)).toEqual([pai.id, filha.id, neta.id]);
  });

  it('mover a nota a deixa pendente de envio', async () => {
    const { createNote, moveNote, markNoteSynced, pendingNotes } = await import('@/lib/notes');
    const { createFolder } = await import('@/lib/noteFolders');
    const pasta = createFolder(USER, 'Trabalho');
    const nota = createNote(USER, 'Ideias');
    markNoteSynced(USER, nota.id, 1);
    expect(pendingNotes(USER)).toEqual([]);

    moveNote(USER, nota.id, pasta.id);
    expect(pendingNotes(USER).map((n) => n.id)).toEqual([nota.id]);
  });
});
