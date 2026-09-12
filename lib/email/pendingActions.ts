import { getDb } from '@/lib/db';

/**
 * O que o usuário pediu, guardado antes de a ação chegar ao servidor.
 *
 * Sem este registro a intenção vivia só num cache de memória: o retrato
 * seguinte do IMAP — que ainda trazia a mensagem, por atraso do provedor ou
 * porque a escrita falhou — desfazia a exclusão, e o reinício do serviço
 * apagava tudo que ainda não tinha chegado ao servidor.
 */
export type PendingKind = 'delete' | 'seen' | 'unseen' | 'move';

export type PendingState = 'pending' | 'failed';

export interface PendingAction {
  id: number;
  userId: string;
  account: string;
  /** Caminho da pasta no servidor. O uid só tem sentido dentro de uma. */
  mailbox: string;
  /** UIDVALIDITY da pasta quando a ação foi pedida. Vazio quando o servidor
   *  ainda não foi consultado; o uid continua válido enquanto ele não mudar. */
  uidvalidity: string;
  uid: string;
  kind: PendingKind;
  /** Pasta de destino, no `move`. Nulo nas demais. */
  payload: string | null;
  createdAt: string;
  /** Quando a escrita chegou ao servidor. Nulo enquanto não chegou. */
  appliedAt: string | null;
  attempts: number;
  nextAttemptAt: string;
  state: PendingState;
  lastError: string | null;
}

/** Depois disto a ação para de ser tentada e vira erro à mostra: esconder uma
 *  mensagem que não foi apagada seria mentir sobre o estado da caixa. */
export const MAX_ATTEMPTS = 5;

const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 300_000;

/** Espera crescente com sorteio. Sem o sorteio, várias ações que falharam
 *  juntas voltariam juntas e repetiriam a disputa que as derrubou. */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
  return Math.round(base * (0.5 + random() * 0.5));
}

interface Row {
  id: number;
  user_id: string;
  account: string;
  mailbox: string;
  uidvalidity: string;
  uid: string;
  action: string;
  payload: string | null;
  created_at: string;
  applied_at: string | null;
  attempts: number;
  next_attempt_at: string;
  state: string;
  last_error: string | null;
}

function toAction(row: Row): PendingAction {
  return {
    id: row.id,
    userId: row.user_id,
    account: row.account,
    mailbox: row.mailbox,
    uidvalidity: row.uidvalidity,
    uid: row.uid,
    kind: row.action as PendingKind,
    payload: row.payload,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    state: row.state as PendingState,
    lastError: row.last_error,
  };
}

/** `seen` e `unseen` são a mesma decisão em sentidos opostos: a nova apaga a
 *  anterior em vez de as duas ficarem pendentes ao mesmo tempo. */
const OPOSTA: Partial<Record<PendingKind, PendingKind>> = { seen: 'unseen', unseen: 'seen' };

export interface RecordInput {
  userId: string;
  account: string;
  uid: string;
  kind: PendingKind;
  mailbox?: string;
  uidvalidity?: string;
  payload?: string | null;
}

export const INBOX_PATH = 'INBOX';

/**
 * Grava a intenção. Repetir a mesma ação sobre a mesma mensagem não cria uma
 * segunda linha: reabre a que existe, o que é o que faz o replay ser seguro
 * de repetir.
 */
export function recordPendingAction(input: RecordInput, now: Date = new Date()): PendingAction {
  const mailbox = input.mailbox ?? INBOX_PATH;
  const uidvalidity = input.uidvalidity ?? '';
  const instante = now.toISOString();
  const db = getDb();

  db.transaction(() => {
    const oposta = OPOSTA[input.kind];
    if (oposta) {
      db.prepare(
        `DELETE FROM email_pending_actions
         WHERE user_id = ? AND account = ? AND mailbox = ? AND uidvalidity = ? AND uid = ? AND action = ?`,
      ).run(input.userId, input.account, mailbox, uidvalidity, input.uid, oposta);
    }

    db.prepare(
      `INSERT INTO email_pending_actions
         (user_id, account, mailbox, uidvalidity, uid, action, payload,
          created_at, applied_at, attempts, next_attempt_at, state, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, 'pending', NULL)
       ON CONFLICT (user_id, account, mailbox, uidvalidity, uid, action)
       DO UPDATE SET payload = excluded.payload,
                     applied_at = NULL,
                     attempts = 0,
                     next_attempt_at = excluded.next_attempt_at,
                     state = 'pending',
                     last_error = NULL`,
    ).run(
      input.userId,
      input.account,
      mailbox,
      uidvalidity,
      input.uid,
      input.kind,
      input.payload ?? null,
      instante,
      instante,
    );
  })();

  const row = db
    .prepare(
      `SELECT * FROM email_pending_actions
       WHERE user_id = ? AND account = ? AND mailbox = ? AND uidvalidity = ? AND uid = ? AND action = ?`,
    )
    .get(input.userId, input.account, mailbox, uidvalidity, input.uid, input.kind) as Row;
  return toAction(row);
}

export function listPendingActions(userId: string): PendingAction[] {
  return (
    getDb()
      .prepare('SELECT * FROM email_pending_actions WHERE user_id = ? ORDER BY id')
      .all(userId) as Row[]
  ).map(toAction);
}

/** O que ainda não chegou ao servidor e já pode ser tentado de novo. */
export function listDuePendingActions(userId: string, now: Date = new Date()): PendingAction[] {
  return (
    getDb()
      .prepare(
        `SELECT * FROM email_pending_actions
         WHERE user_id = ? AND state = 'pending' AND applied_at IS NULL AND next_attempt_at <= ?
         ORDER BY id`,
      )
      .all(userId, now.toISOString()) as Row[]
  ).map(toAction);
}

export function markApplied(id: number, now: Date = new Date()): void {
  getDb()
    .prepare('UPDATE email_pending_actions SET applied_at = ?, last_error = NULL WHERE id = ?')
    .run(now.toISOString(), id);
}

/**
 * Uma tentativa que não deu certo — a escrita falhou, ou ela foi feita e o
 * servidor continua discordando. Esgotadas as tentativas, a ação para de ser
 * repetida e o erro passa a aparecer na linha da mensagem.
 */
export function markAttemptFailed(id: number, error: string, now: Date = new Date()): void {
  const db = getDb();
  const row = db.prepare('SELECT attempts FROM email_pending_actions WHERE id = ?').get(id) as
    | { attempts: number }
    | undefined;
  if (!row) return;

  const attempts = row.attempts + 1;
  const state: PendingState = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
  db.prepare(
    `UPDATE email_pending_actions
     SET attempts = ?, state = ?, last_error = ?, applied_at = NULL, next_attempt_at = ?
     WHERE id = ?`,
  ).run(attempts, state, error, new Date(now.getTime() + backoffMs(attempts)).toISOString(), id);
}

/** O servidor concordou: a intenção cumpriu o seu papel e sai do caminho. */
export function confirmPendingAction(id: number): void {
  getDb().prepare('DELETE FROM email_pending_actions WHERE id = ?').run(id);
}

export function clearFailedAction(userId: string, id: number): void {
  getDb()
    .prepare("DELETE FROM email_pending_actions WHERE id = ? AND user_id = ? AND state = 'failed'")
    .run(id, userId);
}

/**
 * O UIDVALIDITY da pasta mudou: todo uid guardado antes passou a apontar para
 * outra mensagem. Aplicar a ação agora acertaria quem não foi escolhido, então
 * ela falha à vista em vez de ser executada.
 *
 * A ação gravada antes de a pasta anunciar o seu número fica de fora: ela não
 * atravessou reindexação nenhuma, só nasceu antes de haver o que comparar.
 */
export function invalidateForUidValidity(
  userId: string,
  account: string,
  mailbox: string,
  uidvalidity: string,
): number {
  const result = getDb()
    .prepare(
      `UPDATE email_pending_actions
       SET state = 'failed', last_error = ?, applied_at = NULL
       WHERE user_id = ? AND account = ? AND mailbox = ?
         AND uidvalidity <> '' AND uidvalidity <> ? AND state = 'pending'`,
    )
    .run(
      'a caixa foi reindexada pelo servidor e esta ação não pôde ser confirmada',
      userId,
      account,
      mailbox,
      uidvalidity,
    );
  return result.changes;
}
