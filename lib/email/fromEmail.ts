/**
 * O que uma nota e uma tarefa levam de um e-mail.
 *
 * A nota leva o assunto e o corpo; a tarefa leva o assunto e quem escreveu, e
 * nada do corpo — uma tarefa é o que fazer, não a mensagem inteira.
 */

/** Assunto vazio existe, e uma nota sem título nenhum some da lista de abas. */
export const SEM_ASSUNTO = '(sem assunto)';

/** Teto do título, para não estourar o limite da nota nem virar uma aba que
 *  ocupa a barra inteira. */
const MAX_TITULO = 120;

export function subjectTitle(subject: string): string {
  const limpo = subject.replace(/\s+/g, ' ').trim();
  return (limpo || SEM_ASSUNTO).slice(0, MAX_TITULO);
}

/**
 * Quem escreveu, como a tarefa vai mostrar.
 *
 * O envelope já entrega o nome quando ele existe e o endereço quando não —
 * aqui só sobra decidir o que fazer quando não veio nem um nem outro.
 */
export function senderLabel(from: string): string {
  return from.replace(/\s+/g, ' ').trim() || 'remetente desconhecido';
}

/**
 * O título da tarefa: o assunto, e quem escreveu depois dele.
 *
 * O módulo de tarefas não tem campo gravável além do título — `notes` existe
 * no modelo mas nenhuma das funções de escrita o aceita —, então o remetente
 * viaja aqui. Ele vem depois de um travessão para o assunto continuar sendo o
 * começo da linha, que é o que se lê na lista.
 */
export function taskTitleFrom(subject: string, from: string): string {
  return `${subjectTitle(subject)} — ${senderLabel(from)}`.slice(0, MAX_TITULO + 60);
}

/**
 * Um clique repetido não pode criar duas.
 *
 * A tela já bloqueia o botão enquanto a criação está em voo, mas isso não
 * cobre o duplo envio que sai antes de a primeira resposta voltar. Aqui a
 * mesma origem — usuário, conta, pasta, uid e tipo — devolve o que foi criado
 * da primeira vez, por uma janela curta. Passada a janela, pedir de novo é um
 * pedido novo: criar uma segunda nota do mesmo e-mail amanhã é legítimo.
 */
export const IDEMPOTENCY_WINDOW_MS = 60_000;

interface Registro {
  id: string;
  em: number;
}

// O build de produção empacota este módulo mais de uma vez; guardado no
// processo, todas as cópias enxergam o mesmo registro.
const KEY = Symbol.for('daily-web.email.fromEmail');
const recentes: Map<string, Registro> = ((globalThis as Record<symbol, unknown>)[KEY] ??= new Map<
  string,
  Registro
>()) as Map<string, Registro>;

export interface CreationOrigin {
  userId: string;
  account: string;
  folder: string;
  uid: string;
  kind: 'note' | 'task';
}

function chave(origem: CreationOrigin): string {
  return [origem.userId, origem.account, origem.folder, origem.uid, origem.kind].join(' ');
}

/** Limpa o que envelheceu. O mapa é pequeno, mas nada cresce sem limite. */
function expirar(agora: number): void {
  for (const [k, registro] of recentes) {
    if (agora - registro.em > IDEMPOTENCY_WINDOW_MS) recentes.delete(k);
  }
}

/** O que já foi criado desta origem na janela, ou nulo. */
export function recentCreation(origem: CreationOrigin, agora = Date.now()): string | null {
  expirar(agora);
  const registro = recentes.get(chave(origem));
  if (!registro) return null;
  return agora - registro.em <= IDEMPOTENCY_WINDOW_MS ? registro.id : null;
}

export function rememberCreation(origem: CreationOrigin, id: string, agora = Date.now()): void {
  expirar(agora);
  recentes.set(chave(origem), { id, em: agora });
}

export function resetCreationsForTests(): void {
  recentes.clear();
}
