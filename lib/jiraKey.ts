/** Uma chave do Jira: letras, hífen, números. Vale validar aqui porque ela
 *  entra numa JQL, e um valor livre ali seria injeção de consulta.
 *
 *  Fica fora de `preferences` porque o painel também valida a chave que vem
 *  da URL, e `preferences` puxa o banco, que não pode ir para o navegador. */
const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/;

export function isJiraKey(value: unknown): value is string {
  return typeof value === 'string' && JIRA_KEY_PATTERN.test(value.toUpperCase());
}
