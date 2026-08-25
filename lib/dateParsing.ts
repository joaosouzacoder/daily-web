export interface ParsedDue {
  due: string;
  time: string;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RELATIVE_RE = /^\+(\d+)d$/;

function isValidDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

// Usa os getters locais (não toISOString, que trunca em UTC) para que "hoje"
// e "amanhã" reflitam a data local do usuário — mesmo fix aplicado em
// lib/taskGrouping.ts's toLocalDateString, replicado aqui para as duas
// concordarem sobre o que é "hoje".
function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDueInput(input: string, now: Date = new Date()): ParsedDue {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { due: 'none', time: 'none' };
  }

  const parts = trimmed.split(/\s+/);
  const datePart = parts[0].toLowerCase();
  const timePart = parts[1];

  let due: string;
  if (datePart === 'hoje') {
    due = toIso(now);
  } else if (datePart === 'amanhã' || datePart === 'amanha') {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 1);
    due = toIso(d);
  } else {
    const relative = RELATIVE_RE.exec(datePart);
    if (relative) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + Number(relative[1]));
      due = toIso(d);
    } else {
      const iso = ISO_RE.exec(datePart);
      if (!iso) {
        throw new Error(`data inválida: ${parts[0]}`);
      }
      const [, y, m, d] = iso;
      if (!isValidDate(Number(y), Number(m), Number(d))) {
        throw new Error(`data inválida: ${parts[0]}`);
      }
      due = datePart;
    }
  }

  if (timePart === undefined) {
    return { due, time: 'none' };
  }
  if (!TIME_RE.test(timePart)) {
    throw new Error(`hora inválida: ${timePart} — use HH:MM`);
  }
  return { due, time: timePart };
}
