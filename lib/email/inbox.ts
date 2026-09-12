import { listSent } from '@/lib/integrations/imap';
import { INBOX_PATH } from './pendingActions';
import { syncFolder } from './sync';
import type { Connection } from '@/lib/vault/connections';
import type { EmailEnvelope } from '@/lib/types';

/**
 * A caixa de entrada do painel, mais os enviados que compõem as conversas.
 *
 * A entrada é sincronizada por diferença: o ciclo pede o que chegou depois do
 * último uid conhecido, não a caixa inteira. Os enviados continuam vindo do
 * servidor a cada ciclo, com teto — eles só existem aqui para o fio de
 * conversa não parecer um monólogo, e não têm ação nem estado a preservar.
 */
export async function loadInbox(
  userId: string,
  connection: Connection,
  limit: number,
): Promise<EmailEnvelope[]> {
  const entrada = await syncFolder(userId, connection, INBOX_PATH, limit);
  // Uma pasta de enviados que não existe ou não abre não pode derrubar a
  // caixa de entrada: sem ela a conversa fica incompleta, sem a entrada não
  // há painel nenhum.
  const enviados = await listSent(connection, limit).catch(() => []);
  return [...entrada.envelopes, ...enviados];
}
