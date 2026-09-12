import { fetchInboxAndSent } from '@/lib/integrations/imap';
import { INBOX_PATH } from './pendingActions';
import { applyFolderChanges, folderCursor, FLAG_WINDOW } from './sync';
import type { Connection } from '@/lib/vault/connections';
import type { EmailEnvelope } from '@/lib/types';

/**
 * A caixa de entrada do painel, mais os enviados que compõem as conversas.
 *
 * As duas vêm na mesma conexão: o login no Gmail é a parte cara da ida, e uma
 * conexão a mais por conta a cada ciclo custava mais do que a busca inteira.
 *
 * A entrada é sincronizada por diferença — o ciclo pede o que chegou depois do
 * último uid conhecido, não a caixa inteira. Os enviados continuam vindo do
 * servidor a cada ciclo, com teto: eles só existem aqui para o fio de conversa
 * não parecer um monólogo, e não têm ação nem estado a preservar.
 */
export async function loadInbox(
  userId: string,
  connection: Connection,
  limit: number,
): Promise<EmailEnvelope[]> {
  const desde = folderCursor(userId, connection, INBOX_PATH);
  const { changes, sent } = await fetchInboxAndSent(connection, desde, FLAG_WINDOW, limit);
  const entrada = await applyFolderChanges(userId, connection, INBOX_PATH, limit, changes);
  return [...entrada.envelopes, ...sent];
}
