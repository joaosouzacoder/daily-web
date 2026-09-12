'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MailboxGroup } from '@/components/email/FolderTree';
import type { MailboxNode, MailboxRef } from '@/lib/types';

/**
 * As pastas de cada conta: o que está guardado aparece na hora, e a leitura do
 * servidor vem por cima sem tirar nada da tela.
 *
 * Cada conta tem o próprio estado. Uma caixa fora do ar mostra o erro dela e
 * deixa as outras em paz — era isso ou a árvore inteira ficar refém da pior
 * conta cadastrada.
 */

/** Teto de uma ida ao servidor. Sem ele, uma conta que não responde deixaria o
 *  indicador de atualização girando para sempre. */
const TIMEOUT_MS = 30_000;

type Estado = Record<string, Omit<MailboxGroup, 'account'>>;

const VAZIO: Omit<MailboxGroup, 'account'> = {
  mailboxes: [],
  loading: true,
  syncing: false,
  error: null,
};

async function pedir(url: string, signal: AbortSignal): Promise<{ mailboxes: MailboxNode[] }> {
  const res = await fetch(url, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'não deu para ler as pastas');
  return data as { mailboxes: MailboxNode[] };
}

export function useMailboxGroups(
  accounts: MailboxRef[],
  enabled: boolean,
): { groups: MailboxGroup[]; retry: (accountId: string) => void } {
  const [estado, setEstado] = useState<Estado>({});
  // Uma sincronização por conta de cada vez: reabrir o painel enquanto a
  // anterior corre não pode abrir uma segunda.
  const emCurso = useRef<Set<string>>(new Set());
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const aplicar = useCallback((id: string, mudanca: Partial<Omit<MailboxGroup, 'account'>>) => {
    if (!montado.current) return;
    setEstado((atual) => ({ ...atual, [id]: { ...VAZIO, ...atual[id], ...mudanca } }));
  }, []);

  const sincronizar = useCallback(
    async (id: string) => {
      if (emCurso.current.has(id)) return;
      emCurso.current.add(id);
      aplicar(id, { syncing: true, error: null });

      const controle = new AbortController();
      const prazo = setTimeout(() => controle.abort(), TIMEOUT_MS);
      try {
        const { mailboxes } = await pedir(
          `/api/email/mailboxes?account=${encodeURIComponent(id)}&sync=1`,
          controle.signal,
        );
        // O que veio do servidor substitui a árvore: é assim que pasta criada,
        // renomeada e apagada aparecem sem ninguém recarregar a tela.
        aplicar(id, { mailboxes, loading: false, syncing: false, error: null });
      } catch (err) {
        const mensagem =
          err instanceof DOMException && err.name === 'AbortError'
            ? 'a conta demorou demais para responder'
            : err instanceof Error
              ? err.message
              : 'não deu para atualizar as pastas';
        // O que já estava na tela continua lá: a falha oferece tentar de novo.
        aplicar(id, { loading: false, syncing: false, error: mensagem });
      } finally {
        clearTimeout(prazo);
        emCurso.current.delete(id);
      }
    },
    [aplicar],
  );

  useEffect(() => {
    if (!enabled) return;
    const controle = new AbortController();

    for (const conta of accounts) {
      // Primeiro o que está guardado, que abre a tela na hora; a leitura do
      // servidor vem depois, por cima.
      void pedir(`/api/email/mailboxes?account=${encodeURIComponent(conta.id)}`, controle.signal)
        .then(({ mailboxes }) => aplicar(conta.id, { mailboxes, loading: false }))
        .catch(() => aplicar(conta.id, { loading: false }))
        .finally(() => {
          if (!controle.signal.aborted) void sincronizar(conta.id);
        });
    }

    return () => controle.abort();
    // As contas vêm do estado do painel e mudam de identidade a cada ciclo;
    // o que importa aqui é quais são elas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, accounts.map((a) => a.id).join(' '), aplicar, sincronizar]);

  const groups: MailboxGroup[] = accounts.map((account) => ({
    account,
    ...(estado[account.id] ?? VAZIO),
  }));

  return { groups, retry: (id) => void sincronizar(id) };
}
