import type { TaskPriority } from '@/lib/types';
import type { Recur } from '@/lib/tasks/types';

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const FOLDER_PATTERN = /^[A-Za-z0-9 _\-/]+$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const VALID_TASK_PRIORITIES: TaskPriority[] = ['low', 'normal', 'high'];
const VALID_RECURS: Recur[] = ['none', 'daily', 'weekly', 'monthly'];

// Uma conta não é mais validada por formato: ela é um id de conexão, e a
// checagem que importa é de posse, feita em requireConnection contra o dono
// da sessão. Validar o formato aqui daria a impressão de proteção sem
// impedir que alguém usasse a conexão de outra pessoa.

export function isValidEmailId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value) && !value.startsWith('-');
}

export function isValidFolder(value: unknown): value is string {
  return typeof value === 'string' && FOLDER_PATTERN.test(value) && !value.startsWith('-');
}

// Mesmo risco de argument injection do Task 16 (id passado como argumento
// posicional a um CLI via execFile): um id iniciado com "-" pode ser
// interpretado como flag pelo parser do mstodo CLI em vez de um id literal.
export function isValidTaskId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value) && !value.startsWith('-');
}

export function isValidTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === 'string' && (VALID_TASK_PRIORITIES as string[]).includes(value);
}

export function isValidRecur(value: unknown): value is Recur {
  return typeof value === 'string' && (VALID_RECURS as string[]).includes(value);
}

// Guarda mínima para valores de texto livre (ex.: title) que acabam como
// argumento posicional ou valor de flag em uma chamada execFile. Não aplica
// o charset restrito de isValidTaskId (title precisa aceitar espaços,
// acentos, pontuação) — apenas recusa um "-" inicial, que um parser de CLI
// poderia interpretar como início de outra flag.
export function isSafePositionalValue(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('-');
}

export function isValidRepo(value: unknown): value is string {
  return typeof value === 'string' && REPO_PATTERN.test(value);
}
