// Janela de datas que a agenda cobre. Usa os getters locais (não
// toISOString, que trunca em UTC) para começar e terminar na data local de
// quem está olhando.

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface AgendaWindow {
  start: string;
  end: string;
}

export interface RangeOption {
  days: number;
  label: string;
  /** Como o painel descreve o período quando não há nada agendado. */
  emptyLabel: string;
}

// Quantos dias a agenda mostra é escolha de cada pessoa: quem tem o dia cheio
// quer só hoje, quem se organiza na semana quer sete. A lista é curta de
// propósito — um campo numérico livre daria mais escolha e menos decisão.
export const AGENDA_RANGES: RangeOption[] = [
  { days: 1, label: 'Hoje', emptyLabel: 'para hoje' },
  { days: 2, label: 'Hoje e amanhã', emptyLabel: 'para hoje e amanhã' },
  { days: 3, label: '3 dias', emptyLabel: 'nos próximos 3 dias' },
  { days: 7, label: '7 dias', emptyLabel: 'nos próximos 7 dias' },
  { days: 14, label: '14 dias', emptyLabel: 'nos próximos 14 dias' },
];

/** O resumo do módulo sempre prometeu "hoje e amanhã"; a janela era de sete
 *  dias. Dois é a promessa cumprida, e é o que cabe no painel sem esticar. */
export const DEFAULT_AGENDA_DAYS = 2;

export function isAgendaRange(days: unknown): days is number {
  return typeof days === 'number' && AGENDA_RANGES.some((r) => r.days === days);
}

export function agendaRange(days: number): RangeOption {
  return AGENDA_RANGES.find((r) => r.days === days) ?? AGENDA_RANGES[1];
}

/** `days` conta a partir de hoje, incluindo hoje: 1 é só hoje, 2 é hoje e
 *  amanhã. Antes a janela era fixa em `hoje + 7`, que na prática mostrava
 *  oito dias. */
export function computeAgendaWindow(
  now: Date = new Date(),
  days: number = DEFAULT_AGENDA_DAYS,
): AgendaWindow {
  const span = Math.max(1, Math.floor(days));
  const end = new Date(now);
  end.setDate(end.getDate() + span - 1);
  return { start: toLocalDateString(now), end: toLocalDateString(end) };
}
