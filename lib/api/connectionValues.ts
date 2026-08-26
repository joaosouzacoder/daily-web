import { MODULES, type ModuleId } from '@/lib/modules';

/** Só campos declarados do módulo entram. Sem isso o cliente poderia gravar
 *  chaves arbitrárias, que depois viram configuração de integração. */
export function pickDeclaredValues(
  moduleId: ModuleId,
  incoming: Record<string, unknown>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of MODULES[moduleId].fields) {
    // Campo oculto é escrito pelo servidor (o refresh token do OAuth, por
    // exemplo); aceitar do cliente seria deixá-lo forjar a conexão.
    if (field.hidden) continue;
    const value = incoming[field.name];
    if (typeof value === 'string' && value !== '') values[field.name] = value;
  }
  return values;
}
