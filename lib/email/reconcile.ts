import type { EmailEnvelope } from '@/lib/types';
import {
  confirmPendingAction,
  markAttemptFailed,
  FOLDER_KINDS,
  type PendingAction,
} from './pendingActions';

/**
 * O retrato que vem do IMAP é o que o servidor sabia num instante que já
 * passou. Ele nunca sobrescreve o que o usuário pediu: as ações pendentes são
 * sobrepostas a ele até o servidor concordar ou a ação falhar em definitivo.
 */

// O uid só identifica dentro de uma pasta: o mesmo número aponta para outra
// mensagem na entrada e nos enviados.
function chave(account: string, folder: string, uid: string): string {
  return `${account} ${folder} ${uid}`;
}

function daPasta(account: string, folder: string): string {
  return `${account} ${folder}`;
}

function ehDePasta(acao: PendingAction): boolean {
  return FOLDER_KINDS.includes(acao.kind);
}

interface Indice {
  porMensagem: Map<string, PendingAction[]>;
  porPasta: Map<string, PendingAction[]>;
}

function indexar(pending: PendingAction[]): Indice {
  const porMensagem = new Map<string, PendingAction[]>();
  const porPasta = new Map<string, PendingAction[]>();

  for (const acao of pending) {
    const dePasta = ehDePasta(acao);
    const mapa = dePasta ? porPasta : porMensagem;
    const k = dePasta
      ? daPasta(acao.account, acao.mailbox)
      : chave(acao.account, acao.mailbox, acao.uid);
    const atual = mapa.get(k);
    if (atual) atual.push(acao);
    else mapa.set(k, [acao]);
  }
  return { porMensagem, porPasta };
}

export function reconcileEnvelopes(
  envelopes: EmailEnvelope[],
  pending: PendingAction[],
): EmailEnvelope[] {
  if (pending.length === 0) return envelopes;
  const { porMensagem, porPasta } = indexar(pending);

  const resultado: EmailEnvelope[] = [];
  for (const envelope of envelopes) {
    const daMensagem = porMensagem.get(chave(envelope.account, envelope.folder, envelope.id)) ?? [];
    const daPastaDela = porPasta.get(daPasta(envelope.account, envelope.folder)) ?? [];
    const acoes = [...daPastaDela, ...daMensagem];
    if (acoes.length === 0) {
      resultado.push(envelope);
      continue;
    }

    // Apagada ou movida para outra pasta e ainda não desistida: a mensagem não
    // aparece aqui. Quando a ação falha em definitivo ela volta — com o erro,
    // porque continua na pasta e fingir o contrário seria mentir sobre o
    // servidor.
    if (acoes.some((a) => (a.kind === 'delete' || a.kind === 'move') && a.state === 'pending')) {
      continue;
    }

    const erro = acoes.find((a) => a.state === 'failed' && a.lastError)?.lastError ?? null;
    let unread = envelope.unread;
    for (const acao of acoes) {
      if (acao.state !== 'pending') continue;
      // Copiar para outra pasta marca como lida no servidor; a tela acompanha.
      if (acao.kind === 'seen' || acao.kind === 'tag' || acao.kind === 'read_folder') unread = false;
      else if (acao.kind === 'unseen') unread = true;
    }

    resultado.push(erro ? { ...envelope, unread, actionError: erro } : { ...envelope, unread });
  }
  return resultado;
}

/**
 * Fecha o ciclo: a ação que já chegou ao servidor sai do caminho quando o
 * retrato concorda com ela. Se ele discorda, a escrita não pegou — a ação
 * volta para a fila em vez de ser dada como feita.
 *
 * Só entram ações cuja escrita aconteceu antes de o retrato ser tirado: um
 * retrato anterior à escrita não tem o que confirmar.
 */
export function confirmAgainstSnapshot(
  userId: string,
  envelopes: EmailEnvelope[],
  pending: PendingAction[],
  snapshotStartedAt: Date,
  now: Date = new Date(),
): void {
  const doRetrato = new Map<string, EmailEnvelope>();
  const naoLidasPorPasta = new Map<string, number>();
  // Uma pasta que não veio no retrato não foi lida agora: nada a respeito
  // dela pode ser concluído daqui.
  const pastasNoRetrato = new Set<string>();

  for (const envelope of envelopes) {
    doRetrato.set(chave(envelope.account, envelope.folder, envelope.id), envelope);
    const k = daPasta(envelope.account, envelope.folder);
    pastasNoRetrato.add(k);
    if (envelope.unread) naoLidasPorPasta.set(k, (naoLidasPorPasta.get(k) ?? 0) + 1);
  }

  for (const acao of pending) {
    if (acao.userId !== userId || acao.state !== 'pending' || acao.appliedAt === null) continue;
    if (new Date(acao.appliedAt) > snapshotStartedAt) continue;

    const envelope = doRetrato.get(chave(acao.account, acao.mailbox, acao.uid));
    const pasta = daPasta(acao.account, acao.mailbox);

    let concorda: boolean;
    if (acao.kind === 'read_folder') {
      // O teto de uma tentativa pode não ter dado conta da pasta inteira: ela
      // só está feita quando não sobrou não lida nenhuma.
      if (!pastasNoRetrato.has(pasta)) continue;
      concorda = (naoLidasPorPasta.get(pasta) ?? 0) === 0;
    } else if (acao.kind === 'delete' || acao.kind === 'move') {
      concorda = envelope === undefined;
    } else if (acao.kind === 'seen') {
      concorda = envelope === undefined || !envelope.unread;
    } else if (acao.kind === 'unseen') {
      concorda = envelope === undefined || envelope.unread;
    } else {
      // `tag` é uma cópia para outra pasta: a origem não muda, então não há no
      // retrato o que observar além de a escrita ter passado.
      concorda = true;
    }

    if (concorda) confirmPendingAction(acao.id);
    else markAttemptFailed(acao.id, 'o servidor ainda não refletiu esta ação', now);
  }
}
