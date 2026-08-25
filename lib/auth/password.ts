import bcrypt from 'bcryptjs';

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function verifyUsername(input: string, expected: string): boolean {
  return input === expected;
}
