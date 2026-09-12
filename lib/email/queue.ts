// Uma conexão IMAP por conta de cada vez. O ciclo de leitura segura a conexão
// por segundos, e uma ação disparada nesse meio-tempo abria um segundo login
// na mesma conta: o provedor recusa o excedente, a ação falhava e a mensagem
// voltava para a tela. Aqui tudo que fala com uma conta entra em fila.

/** Teto da fila de cada conta. Sem limite, uma caixa fora do ar acumularia
 *  operações que ninguém mais espera até prender memória. */
export const MAX_QUEUED_PER_ACCOUNT = 50;

/** Teto de uma operação na fila. Os tempos do IMAP já limitam a conexão; este
 *  é o limite de quem está preso atrás dela, para a fila não parar de andar. */
const OPERATION_TIMEOUT_MS = 120_000;

interface AccountQueue {
  /** A última operação da fila. A próxima se encadeia nela. */
  tail: Promise<unknown>;
  queued: number;
}

// O build de produção empacota este módulo mais de uma vez — o ciclo de fundo
// carrega uma cópia e as rotas outra. Uma fila por cópia não seria fila
// nenhuma: as duas abririam conexões ao mesmo tempo na mesma conta.
const STATE_KEY = Symbol.for('daily-web.email.queue');
const queues: Map<string, AccountQueue> = ((globalThis as Record<symbol, unknown>)[STATE_KEY] ??=
  new Map<string, AccountQueue>()) as Map<string, AccountQueue>;

function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('a operação de e-mail passou do tempo limite')),
      ms,
    );
    fn().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Roda `fn` sozinha na conta `key`, esperando a vez. Contas diferentes correm
 * em paralelo — o limite do provedor é por conta, não global.
 */
export function runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const queue = queues.get(key) ?? { tail: Promise.resolve(), queued: 0 };
  if (queue.queued >= MAX_QUEUED_PER_ACCOUNT) {
    return Promise.reject(new Error('a fila de operações desta caixa está cheia'));
  }

  queue.queued += 1;
  queues.set(key, queue);

  // O encadeamento ignora a falha da anterior de propósito: um erro numa
  // operação não pode travar a fila nem contaminar quem vem depois.
  const resultado = queue.tail.then(
    () => withTimeout(fn, OPERATION_TIMEOUT_MS),
    () => withTimeout(fn, OPERATION_TIMEOUT_MS),
  );

  queue.tail = resultado.then(
    () => undefined,
    () => undefined,
  );
  void queue.tail.then(() => {
    queue.queued -= 1;
    // A conta sem nada na fila sai do mapa: senão ele cresce com cada conta
    // que já passou por aqui.
    if (queue.queued === 0 && queues.get(key) === queue) queues.delete(key);
  });

  return resultado;
}

export function resetQueuesForTests(): void {
  queues.clear();
}
