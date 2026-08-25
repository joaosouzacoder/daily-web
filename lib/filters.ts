export interface ActiveFilter {
  id: string;
  label: string;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

// Busca client-side sobre os dados já carregados: acento- e
// caixa-insensível dos dois lados, para "revisao" achar "Revisão".
export function matchesQuery(fields: string[], query: string): boolean {
  const term = normalize(query.trim());
  if (!term) return true;
  return fields.some((field) => normalize(field).includes(term));
}

// Num painel que se lê de relance, "3h" diz mais que a data completa.
// Só passa a mostrar a data quando a distância já não cabe em horas.
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 7) return `${days}d`;

  const day = String(then.getDate()).padStart(2, '0');
  const month = String(then.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}
