const JIRA_ACCOUNT_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

/**
 * Valida o accountId de uma pessoa no Jira.
 * Usado tanto para validar entrada de URL quanto antes de interpolar em JQL
 * para evitar injeção de consulta.
 */
export function isJiraAccountId(value: unknown): value is string {
  return typeof value === 'string' && JIRA_ACCOUNT_ID_PATTERN.test(value);
}
