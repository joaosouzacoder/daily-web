import { getDb } from '@/lib/db';
import { getCredential, type Provider } from './credentials';

// Variáveis que cada provedor injeta na CLI correspondente.
const ENV_MAP: Record<Provider, Record<string, string>> = {
  jira: { cloud: 'JIRA_CLOUD', email: 'JIRA_EMAIL', token: 'JIRA_TOKEN' },
  github: { token: 'GITHUB_TOKEN' },
  mstodo: { clientId: 'DAILY_TUI_TODO_CLIENT_ID', list: 'DAILY_TUI_TODO_LIST' },
};

// O dono da máquina é o admin mais antigo — quem existia antes do
// multiusuário. Só ele herda as variáveis de ambiente do serviço quando não
// cadastrou credencial própria; para os demais, herdar significaria enxergar o
// Jira e o GitHub de outra pessoa sem nunca ter configurado nada.
export function isMachineOwner(userId: string): boolean {
  const row = getDb()
    .prepare('SELECT id FROM users WHERE is_admin = 1 ORDER BY created_at LIMIT 1')
    .get() as { id: string } | undefined;
  return row?.id === userId;
}

export class MissingCredentialError extends Error {
  constructor(provider: Provider) {
    super(`credencial de ${provider} não configurada — cadastre em /config`);
    this.name = 'MissingCredentialError';
  }
}

export function providerEnv(userId: string, provider: Provider): Record<string, string> {
  const stored = getCredential(userId, provider);
  if (stored) {
    const env: Record<string, string> = {};
    for (const [field, variable] of Object.entries(ENV_MAP[provider])) {
      if (stored[field]) env[variable] = stored[field];
    }
    return env;
  }
  if (isMachineOwner(userId)) return {};
  throw new MissingCredentialError(provider);
}
