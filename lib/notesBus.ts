/**
 * O contrato entre quem cria uma nota e o painel que a mostra.
 *
 * Uma nota pode nascer fora do painel — hoje, de um e-mail. Quem a criou já
 * recebeu a resposta do servidor, mas o painel não tem como saber disso: ele
 * lê `/api/notes` uma vez, ao montar. Sem um aviso, a nota só aparecia depois
 * de recarregar a página inteira.
 *
 * O aviso é um evento na janela, do mesmo feitio do `daily-web:focus` do
 * pomodoro: quem avisa não precisa conhecer o painel, nem o painel precisa
 * estar montado para o aviso ser disparado. Nada fica pendurado esperando —
 * não há timer, fila nem repetição.
 *
 * Como usar, de qualquer lugar do cliente:
 *
 *     import { notesChanged } from '@/lib/notesBus';
 *
 *     // depois de criar, mover ou apagar uma nota por outro caminho:
 *     notesChanged();
 *
 *     // para além de recarregar, deixar esta nota aberta no painel:
 *     notesChanged({ activate: noteId });
 *
 * `activate` é o id da nota devolvido pela rota que a criou. O painel
 * recarrega a lista, seleciona a nota, abre a pasta dela na árvore e sai da
 * busca, se houver uma em curso. Um id que não existe (ou de outra pessoa)
 * apenas não seleciona nada — a lista é recarregada do mesmo jeito.
 */

/** O nome do evento. Exportado para quem preferir disparar na mão. */
export const NOTES_CHANGED_EVENT = 'daily-web:notes-changed';

export interface NotesChangedDetail {
  /** Id da nota a deixar aberta no painel depois de recarregar. */
  activate?: string;
}

/** Avisa que as notas mudaram fora do painel. Sem efeito no servidor. */
export function notesChanged(detail: NotesChangedDetail = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<NotesChangedDetail>(NOTES_CHANGED_EVENT, { detail }));
}

/** Escuta o aviso. Devolve a função que cancela a escuta. */
export function onNotesChanged(listener: (detail: NotesChangedDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => listener((event as CustomEvent<NotesChangedDetail>).detail ?? {});
  window.addEventListener(NOTES_CHANGED_EVENT, handler);
  return () => window.removeEventListener(NOTES_CHANGED_EVENT, handler);
}
