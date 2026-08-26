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

export function computeAgendaWindow(now: Date = new Date()): AgendaWindow {
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return { start: toLocalDateString(now), end: toLocalDateString(end) };
}

