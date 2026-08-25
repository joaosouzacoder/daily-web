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
