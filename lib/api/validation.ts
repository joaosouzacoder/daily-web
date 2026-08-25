import type { Account, TaskPriority } from '@/lib/types';
import type { Recur } from '@/lib/cli/mstodo';

const VALID_ACCOUNTS: Account[] = ['work', 'personal'];
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const FOLDER_PATTERN = /^[A-Za-z0-9 _\-/]+$/;
const VALID_TASK_PRIORITIES: TaskPriority[] = ['low', 'normal', 'high'];
const VALID_RECURS: Recur[] = ['none', 'daily', 'weekly', 'monthly'];

export function isValidAccount(value: unknown): value is Account {
  return typeof value === 'string' && (VALID_ACCOUNTS as string[]).includes(value);
}

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
