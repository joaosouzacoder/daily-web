import type { Account } from '@/lib/types';

const VALID_ACCOUNTS: Account[] = ['work', 'personal'];
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const FOLDER_PATTERN = /^[A-Za-z0-9 _\-/]+$/;

export function isValidAccount(value: unknown): value is Account {
  return typeof value === 'string' && (VALID_ACCOUNTS as string[]).includes(value);
}

export function isValidEmailId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value) && !value.startsWith('-');
}

export function isValidFolder(value: unknown): value is string {
  return typeof value === 'string' && FOLDER_PATTERN.test(value) && !value.startsWith('-');
}
