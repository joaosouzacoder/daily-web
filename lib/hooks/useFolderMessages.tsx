'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FolderSelection } from '@/components/email/FolderTree';
import type { EmailEnvelope } from '@/lib/types';

/**
 * As mensagens da pasta aberta, por par (conta, pasta).
 *
 * O par é a chave de tudo: duas contas têm a sua própria "INBOX", e uma
 * listagem guardada sob o caminho sozinho apareceria na conta errada.
 *
 * Uma resposta atrasada da pasta anterior nunca substitui a atual. Cada
 * leitura leva um número; só a última que saiu pode escrever na tela.
 */

/** Teto de uma leitura de pasta. Uma caixa que não responde não pode deixar a
 *  lista em "carregando" para sempre. */
const TIMEOUT_MS = 30_000;

export function folderKey(selection: FolderSelection): string {
  return `${selection.account} ${selection.path}`;
}

export interface FolderMessages {
  /** Nulo enquanto esta pasta nunca foi lida: é o que separa "vazia" de
   *  "ainda não sei". */
  messages: EmailEnvelope[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useFolderMessages(selection: FolderSelection | null): FolderMessages {
  const cache = useRef<Map<string, EmailEnvelope[]>>(new Map());
  const geracao = useRef(0);
  const montado = useRef(true);

  // Primitivos, e não o objeto: a seleção é recriada a cada render e usá-la
  // como dependência refaria a leitura sem parar.
  const account = selection?.account ?? '';
  const path = selection?.path ?? '';
  const chave = account && path ? folderKey({ account, path }) : '';
  const [messages, setMessages] = useState<EmailEnvelope[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    if (!chave) {
      geracao.current += 1;
      setMessages(null);
      setLoading(false);
      setError(null);
      return;
    }

    const minha = (geracao.current += 1);
    const guardadas = cache.current.get(chave) ?? null;

    // O que já se sabe desta pasta aparece na hora; a leitura confirma depois.
    // Sem cache não há o que mostrar, e aí a lista assume o estado de carga.
    setMessages(guardadas);
    setError(null);
    setLoading(guardadas === null);

    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), TIMEOUT_MS);

    void (async () => {
      try {
        const res = await fetch(
          `/api/email/messages?account=${encodeURIComponent(account)}&folder=${encodeURIComponent(path)}`,
          { signal: controle.signal },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'não deu para abrir a pasta');

        const lista = (data.messages ?? []) as EmailEnvelope[];
        cache.current.set(chave, lista);
        // A resposta que chega depois de a pasta ter mudado não escreve:
        // trocar de pasta e ver a anterior aparecer seria pior do que esperar.
        if (!montado.current || minha !== geracao.current) return;
        setMessages(lista);
        setError(null);
      } catch (err) {
        if (!montado.current || minha !== geracao.current) return;
        setError(
          err instanceof DOMException && err.name === 'AbortError'
            ? 'a pasta demorou demais para responder'
            : err instanceof Error
              ? err.message
              : 'não deu para abrir a pasta',
        );
      } finally {
        clearTimeout(prazo);
        if (montado.current && minha === geracao.current) setLoading(false);
      }
    })();

    return () => {
      clearTimeout(prazo);
      controle.abort();
    };
  }, [chave, nonce, account, path]);

  const reload = useCallback(() => {
    if (chave) cache.current.delete(chave);
    setNonce((n) => n + 1);
  }, [chave]);

  return { messages, loading, error, reload };
}
