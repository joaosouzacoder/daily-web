import { describe, expect, it } from 'vitest';
import { normalize, searchNotes } from '@/lib/notesSearch';
import type { Note, NoteFolder } from '@/lib/types';

function note(id: string, title: string, body: string, folderId: string | null = null): Note {
  return { id, title, body, position: 0, updatedAt: '2026-09-01T00:00:00.000Z', folderId };
}

const PASTAS: NoteFolder[] = [
  { id: 'trabalho', name: 'Trabalho', parentId: null, position: 0, updatedAt: '' },
  { id: 'clientes', name: 'Clientes', parentId: 'trabalho', position: 0, updatedAt: '' },
];

describe('normalize', () => {
  it('tira acento e caixa', () => {
    expect(normalize('Sessão ÚNICA')).toBe('sessao unica');
  });

  it('preserva o comprimento, para o trecho sair no lugar certo', () => {
    const texto = 'ação café ñandu';
    expect(normalize(texto)).toHaveLength(texto.length);
  });
});

describe('searchNotes', () => {
  it('sem consulta, não devolve nada', () => {
    expect(searchNotes([note('1', 'Ideias', 'texto')], [], '   ')).toEqual([]);
  });

  it('acha pelo título', () => {
    const results = searchNotes([note('1', 'Reunião', 'nada aqui')], [], 'reuniao');

    expect(results.map((r) => r.note.id)).toEqual(['1']);
    expect(results[0].field).toBe('title');
  });

  it('acha pelo conteúdo', () => {
    const results = searchNotes([note('1', 'Ideias', 'combinamos a MIGRAÇÃO')], [], 'migracao');

    expect(results.map((r) => r.note.id)).toEqual(['1']);
    expect(results[0].field).toBe('body');
  });

  it('ignora caixa e acento nos dois sentidos', () => {
    const notes = [note('1', 'Férias', 'sem nada')];

    expect(searchNotes(notes, [], 'FERIAS')).toHaveLength(1);
    expect(searchNotes([note('2', 'Ferias', '')], [], 'férias')).toHaveLength(1);
  });

  it('mostra o trecho em volta do que bateu, recortado do texto original', () => {
    const corpo = `${'a'.repeat(100)} combinamos a migração para sexta ${'b'.repeat(100)}`;
    const [result] = searchNotes([note('1', 'Ideias', corpo)], [], 'migração');

    expect(result.snippet).toContain('migração');
    expect(result.snippet.startsWith('…')).toBe(true);
    expect(result.snippet.endsWith('…')).toBe(true);
  });

  it('mostra o caminho da pasta', () => {
    const notes = [note('1', 'Contrato', '', 'clientes')];

    expect(searchNotes(notes, PASTAS, 'contrato')[0].path).toEqual(['Trabalho', 'Clientes']);
  });

  it('nota sem pasta tem caminho vazio', () => {
    expect(searchNotes([note('1', 'Solta', '')], PASTAS, 'solta')[0].path).toEqual([]);
  });

  it('restrita ao escopo, ignora as notas de fora', () => {
    const notes = [note('1', 'Contrato', '', 'clientes'), note('2', 'Contrato', '', null)];

    const dentro = searchNotes(notes, PASTAS, 'contrato', { scopeIds: ['trabalho', 'clientes'] });
    expect(dentro.map((r) => r.note.id)).toEqual(['1']);

    const soltas = searchNotes(notes, PASTAS, 'contrato', { scopeIds: [null] });
    expect(soltas.map((r) => r.note.id)).toEqual(['2']);
  });

  it('o acerto no título vem antes do acerto no texto', () => {
    const notes = [note('1', 'Outra', 'fala de contrato'), note('2', 'Contrato', 'nada')];

    expect(searchNotes(notes, [], 'contrato').map((r) => r.note.id)).toEqual(['2', '1']);
  });
});
