import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';

const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_ROUNDS = 10;

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: string;
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    isAdmin: row.is_admin === 1,
    createdAt: row.created_at,
  };
}

export function findUserByUsername(username: string): User | null {
  const row = getDb()
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function listUsers(): User[] {
  const rows = getDb()
    .prepare('SELECT * FROM users ORDER BY created_at')
    .all() as UserRow[];
  return rows.map(toUser);
}

function insert(user: User): User {
  getDb()
    .prepare(
      `INSERT INTO users (id, username, password_hash, is_admin, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(user.id, user.username, user.passwordHash, user.isAdmin ? 1 : 0, user.createdAt);
  return user;
}

export async function createUser(
  username: string,
  password: string,
  isAdmin = false,
): Promise<User> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`a senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (findUserByUsername(username)) {
    throw new Error(`o usuário ${username} já existe`);
  }
  return insert({
    id: randomUUID(),
    username,
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    isAdmin,
    createdAt: new Date().toISOString(),
  });
}

export function removeUser(username: string): boolean {
  return getDb().prepare('DELETE FROM users WHERE username = ?').run(username).changes > 0;
}

export async function setUserPassword(username: string, password: string): Promise<boolean> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`a senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return getDb().prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, username)
    .changes > 0;
}

// Antes do multiusuário o login vinha de DASHBOARD_USER/DASHBOARD_PASSWORD_HASH.
// Reaproveitar o hash que já está no env — em vez de pedir uma senha nova —
// mantém o login do operador funcionando na primeira subida depois da mudança.
// A partir daí o banco manda e as duas variáveis só servem de semente.
export function bootstrapFirstUser(): User | null {
  const username = process.env.DASHBOARD_USER;
  const passwordHash = process.env.DASHBOARD_PASSWORD_HASH;
  if (!username || !passwordHash) return null;
  if (listUsers().length > 0) return null;
  return insert({
    id: randomUUID(),
    username,
    passwordHash,
    isAdmin: true,
    createdAt: new Date().toISOString(),
  });
}
