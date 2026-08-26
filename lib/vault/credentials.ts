import { getDb } from '@/lib/db';
import { encrypt, decrypt } from './crypto';

export type Provider = 'jira' | 'github' | 'mstodo';

export const PROVIDERS: Provider[] = ['jira', 'github', 'mstodo'];

// Cada provedor guarda um conjunto de campos; o registro é um JSON cifrado
// inteiro, em vez de uma linha por campo, para que a credencial seja escrita e
// lida como uma unidade.
export const PROVIDER_FIELDS: Record<Provider, { name: string; label: string; secret: boolean }[]> = {
  jira: [
    { name: 'cloud', label: 'Domínio Jira Cloud', secret: false },
    { name: 'email', label: 'E-mail', secret: false },
    { name: 'token', label: 'API token', secret: true },
  ],
  github: [{ name: 'token', label: 'Personal access token', secret: true }],
  mstodo: [
    { name: 'clientId', label: 'Application (client) ID', secret: false },
    { name: 'list', label: 'Nome da lista', secret: false },
  ],
};

export interface CredentialStatus {
  provider: Provider;
  configured: boolean;
  updatedAt: string | null;
  // Só campos não secretos voltam preenchidos; um token nunca sai do servidor.
  visible: Record<string, string>;
}

export function setCredential(
  userId: string,
  provider: Provider,
  values: Record<string, string>,
): void {
  getDb()
    .prepare(
      `INSERT INTO credentials (user_id, provider, ciphertext, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, provider)
       DO UPDATE SET ciphertext = excluded.ciphertext, updated_at = excluded.updated_at`,
    )
    .run(userId, provider, encrypt(JSON.stringify(values)), new Date().toISOString());
}

export function getCredential(userId: string, provider: Provider): Record<string, string> | null {
  const row = getDb()
    .prepare('SELECT ciphertext FROM credentials WHERE user_id = ? AND provider = ?')
    .get(userId, provider) as { ciphertext: string } | undefined;
  if (!row) return null;
  return JSON.parse(decrypt(row.ciphertext)) as Record<string, string>;
}

export function deleteCredential(userId: string, provider: Provider): boolean {
  return (
    getDb()
      .prepare('DELETE FROM credentials WHERE user_id = ? AND provider = ?')
      .run(userId, provider).changes > 0
  );
}

export function credentialStatus(userId: string, provider: Provider): CredentialStatus {
  const row = getDb()
    .prepare('SELECT ciphertext, updated_at FROM credentials WHERE user_id = ? AND provider = ?')
    .get(userId, provider) as { ciphertext: string; updated_at: string } | undefined;

  if (!row) return { provider, configured: false, updatedAt: null, visible: {} };

  const visible: Record<string, string> = {};
  try {
    const values = JSON.parse(decrypt(row.ciphertext)) as Record<string, string>;
    for (const field of PROVIDER_FIELDS[provider]) {
      if (!field.secret && values[field.name]) visible[field.name] = values[field.name];
    }
  } catch {
    // Credencial ilegível (chave trocada, registro corrompido): reportar como
    // configurada mas sem campos, para a tela oferecer regravar em vez de
    // quebrar a listagem inteira.
  }
  return { provider, configured: true, updatedAt: row.updated_at, visible };
}

export function allStatuses(userId: string): CredentialStatus[] {
  return PROVIDERS.map((provider) => credentialStatus(userId, provider));
}
