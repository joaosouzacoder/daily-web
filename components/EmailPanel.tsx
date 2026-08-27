'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Label, Trash } from 'iconoir-react';
import type { Account, EmailEnvelope, EmailThread, MailboxRef, PanelResult } from '@/lib/types';
import type { ActiveFilter } from '@/lib/filters';
import { matchesQuery, relativeTime } from '@/lib/filters';
import { groupIntoThreads } from '@/lib/parsers/threads';
import { Section } from './ui/Section';
import { FilterBar } from './ui/FilterBar';
import { SearchInput } from './ui/SearchInput';
import { Chip } from './ui/Chip';
import { ActiveFilters } from './ui/ActiveFilters';
import { EmptyState } from './ui/EmptyState';
import { SkeletonRows } from './ui/Skeleton';

interface Props {
  email: PanelResult<EmailEnvelope[]>;
  /** Caixas cadastradas pelo usuário: são elas que viram os chips de filtro. */
  mailboxes: MailboxRef[];
  onChanged: () => void;
  /** Aplica a mudança na tela antes de o servidor responder. */
  onSeenChanged: (targets: { account: string; id: string }[], seen: boolean) => void;
  onRemoved: (targets: { account: string; id: string }[]) => void;
  loading?: boolean;
}

interface BatchTargetResult {
  account: string;
  id: string;
  ok: boolean;
  error?: string;
}

type Sort = 'recent' | 'oldest';
// Era 'work' | 'personal'. Agora é o id de uma caixa cadastrada — quantas a
// pessoa quiser, com o nome que ela deu.
type AccountFilter = 'all' | string;

function key(m: EmailEnvelope): string {
  return `${m.account}:${m.id}`;
}

async function postJson(url: string, body: unknown) {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// POST /api/email/batch sempre responde 200 com { results: [...] }, um
// resultado por alvo (ok/error individuais) — cada alvo pode falhar
// independente dos demais, então lemos o array em vez de assumir
// sucesso ou falha geral da chamada.
async function postBatch(
  targets: { account: string; id: string }[],
  action: 'read' | 'unread' | 'delete' | 'move',
  folder?: string,
): Promise<BatchTargetResult[]> {
  const res = await fetch('/api/email/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(folder !== undefined ? { targets, action, folder } : { targets, action }),
  });
  const data = await res.json();
  return (data.results ?? []) as BatchTargetResult[];
}

export function EmailPanel({
  email,
  mailboxes,
  onChanged,
  onSeenChanged,
  onRemoved,
  loading = false,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Conversas abertas na lista. Uma de uma mensagem não expande: abre direto.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tagMenuKey, setTagMenuKey] = useState<string | null>(null);
  const [appliedTags, setAppliedTags] = useState<Record<string, string[]>>({});
  const [batchError, setBatchError] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [targetFolder, setTargetFolder] = useState('');

  const [query, setQuery] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [account, setAccount] = useState<AccountFilter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  // Listar pastas é uma ida ao IMAP: faz uma vez por conta e reaproveita,
  // para o seletor de etiqueta já abrir pronto.
  const [tagFolders, setTagFolders] = useState<Record<string, string[]>>({});

  const loadTagFolders = async (acc: Account) => {
    if (tagFolders[acc]) return;
    const res = await fetch(`/api/email/folders?account=${acc}`);
    if (!res.ok) return;
    const data = await res.json();
    setTagFolders((prev) => ({ ...prev, [acc]: (data.folders ?? []) as string[] }));
  };

  useEffect(() => {
    if (tagMenuKey === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTagMenuKey(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tagMenuKey]);

  // Etiquetar e excluir valem para a conversa inteira, como no Gmail — e vão
  // pelo lote, que é uma conexão IMAP só para todas as mensagens dela.
  const applyTagToThread = async (thread: EmailThread, tag: string) => {
    const alvos = recebidas(thread).map((m) => ({ account: m.account, id: m.id }));
    // Copiar para a pasta marca como lida no servidor; a tela acompanha.
    onSeenChanged(alvos, true);
    setTagMenuKey(null);

    const failed = (await postBatch(alvos, 'move', tag)).filter((r) => !r.ok);
    if (failed.length > 0) {
      setBatchError(failed[0].error ?? 'Falha ao aplicar etiqueta');
      onChanged();
      return;
    }
    setBatchError(null);
    setAppliedTags((prev) => {
      const atuais = prev[thread.id] ?? [];
      if (atuais.includes(tag)) return prev;
      return { ...prev, [thread.id]: [...atuais, tag] };
    });
    onChanged();
  };

  const removeThread = async (thread: EmailThread) => {
    // A pergunta conta o que será apagado de verdade. Os enviados ficam: a
    // sua cópia do que escreveu não é lixo da caixa de entrada.
    const alvo = recebidas(thread);
    const pergunta =
      alvo.length === 1
        ? 'Excluir este e-mail?'
        : `Excluir esta conversa (${alvo.length} mensagens recebidas)?`;
    if (!window.confirm(pergunta)) return;

    const alvos = alvo.map((m) => ({ account: m.account, id: m.id }));
    const chaves = new Set(alvo.map(key));

    // Some da lista agora. Esperar a ida ao IMAP deixaria a linha parada por
    // um segundo depois do clique, como se nada tivesse acontecido.
    setBatchError(null);
    setOpenKey((prev) => (prev !== null && chaves.has(prev) ? null : prev));
    onRemoved(alvos);

    const failed = (await postBatch(alvos, 'delete')).filter((r) => !r.ok);
    if (failed.length > 0) {
      setBatchError(failed[0].error ?? 'Falha ao excluir');
      // Recarrega para o e-mail voltar: ele não foi apagado de verdade.
      onChanged();
    }
  };

  const all = useMemo(() => email.data ?? [], [email.data]);

  const visible = useMemo(() => {
    const filtered = all.filter(
      (m) =>
        matchesQuery([m.subject, m.from], query) &&
        (!onlyUnread || m.unread) &&
        (account === 'all' || m.account === account),
    );
    return [...filtered].sort((a, b) =>
      sort === 'recent' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
    );
  }, [all, query, onlyUnread, account, sort]);

  // As conversas são montadas depois dos filtros: buscar por "Luan" precisa
  // trazer o que casa, não o fio inteiro em volta.
  const threads = useMemo(() => {
    // Os enviados entram para compor conversa, não para virar linha na caixa:
    // um e-mail que você mandou e ninguém respondeu não é da caixa de entrada.
    const agrupadas = groupIntoThreads(visible).filter((t) =>
      t.messages.some((m) => m.mailbox === 'inbox'),
    );
    return agrupadas.sort((a, b) =>
      sort === 'recent'
        ? b.lastDate.localeCompare(a.lastDate)
        : a.lastDate.localeCompare(b.lastDate),
    );
  }, [visible, sort]);

  const activeFilters: ActiveFilter[] = [
    ...(query.trim() ? [{ id: 'query', label: `Busca: ${query.trim()}` }] : []),
    ...(onlyUnread ? [{ id: 'unread', label: 'Não lidos' }] : []),
    ...(account !== 'all'
      ? [{ id: 'account', label: mailboxes.find((b) => b.id === account)?.label ?? account }]
      : []),
  ];

  const clearFilter = (id: string) => {
    if (id === 'query') setQuery('');
    if (id === 'unread') setOnlyUnread(false);
    if (id === 'account') setAccount('all');
  };

  const clearAll = () => {
    setQuery('');
    setOnlyUnread(false);
    setAccount('all');
  };

  // Âncora do intervalo: no Gmail, Shift+clique marca do último clicado até
  // aqui. Sem guardar qual foi o último, não há de onde partir.
  const ancora = useRef<string | null>(null);

  // Marcar uma conversa marca as mensagens dela: a seleção continua sendo de
  // mensagens, que é o que as ações do lote recebem.
  //
  // Só as recebidas. As ações do lote falam com a INBOX, e o uid dos enviados
  // aponta para outra mensagem lá dentro — além de que apagar a conversa não
  // deve apagar a sua própria cópia do que você escreveu.
  const recebidas = (t: EmailThread) => t.messages.filter((m) => m.mailbox === 'inbox');
  const threadKeys = (t: EmailThread) => recebidas(t).map(key);

  const toggleSelect = (thread: EmailThread, shift: boolean) => {
    const indice = threads.findIndex((t) => t.id === thread.id);
    // A âncora é lida agora, e não dentro do updater: o React chama o updater
    // depois, quando `ancora.current` já é o item recém-clicado — e aí o
    // intervalo teria só um item.
    const inicio = ancora.current === null ? -1 : threads.findIndex((t) => t.id === ancora.current);

    setSelected((prev) => {
      const next = new Set(prev);
      const marcar = !threadKeys(thread).every((k) => next.has(k));
      const aplicar = (t: EmailThread) => {
        for (const k of threadKeys(t)) {
          if (marcar) next.add(k);
          else next.delete(k);
        }
      };

      if (shift && inicio !== -1 && indice !== -1) {
        // O intervalo assume o estado do alvo, como no Gmail: marcar um não
        // marcado marca a faixa toda, desmarcar desmarca a faixa toda.
        const [de, ate] = inicio <= indice ? [inicio, indice] : [indice, inicio];
        for (let i = de; i <= ate; i += 1) aplicar(threads[i]);
        return next;
      }

      aplicar(thread);
      return next;
    });

    // A âncora anda mesmo com Shift, para intervalos encadeados funcionarem.
    ancora.current = thread.id;
  };

  useEffect(() => {
    if (selected.size === 0) {
      setFolders([]);
      setTargetFolder('');
      return;
    }
    const accounts = Array.from(
      new Set(all.filter((m) => selected.has(key(m))).map((m) => m.account)),
    );
    let cancelled = false;
    Promise.all(
      accounts.map((acc) =>
        fetch(`/api/email/folders?account=${acc}`)
          .then((r) => r.json())
          .then((data) => (data.folders ?? []) as string[]),
      ),
    )
      .then((lists) => {
        if (cancelled) return;
        const merged = Array.from(new Set(lists.flat()));
        setFolders(merged);
        setTargetFolder((prev) => (merged.includes(prev) ? prev : (merged[0] ?? '')));
      })
      .catch(() => {
        if (cancelled) return;
        setFolders([]);
        setTargetFolder('');
      });
    return () => {
      cancelled = true;
    };
  }, [selected, all]);

  const runBatch = async (action: 'read' | 'unread' | 'delete' | 'move', folder?: string) => {
    const targets = all
      .filter((m) => selected.has(key(m)))
      .map((m) => ({ account: m.account, id: m.id }));
    if (targets.length === 0) return;

    // A seleção reage na hora; o que falhar volta na correção abaixo.
    if (action === 'read') onSeenChanged(targets, true);
    else if (action === 'unread') onSeenChanged(targets, false);
    else if (action === 'delete') onRemoved(targets);
    else onSeenChanged(targets, true);

    const results = await postBatch(targets, action, folder);
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      setBatchError(
        `${failed.length} de ${results.length} ação(ões) falharam: ${failed
          .map((f) => `${f.account}:${f.id}${f.error ? ` (${f.error})` : ''}`)
          .join(', ')}`,
      );
      setSelected(new Set(failed.map((f) => `${f.account}:${f.id}`)));
      // Alguma coisa não foi feita: o servidor é quem sabe o estado real.
      onChanged();
      return;
    }
    setBatchError(null);
    setSelected(new Set());
  };

  const openMessageData = all.find((m) => key(m) === openKey) ?? null;

  const actions =
    selected.size > 0 ? (
      <>
        <span className="section-count mono">{selected.size} selecionados</span>
        <button type="button" className="btn" onClick={() => void runBatch('read')}>
          Marcar lido
        </button>
        <button type="button" className="btn" onClick={() => void runBatch('unread')}>
          Marcar não lido
        </button>
        {folders.length > 0 && (
          <>
            <select
              className="field"
              aria-label="pasta de destino"
              value={targetFolder}
              onChange={(e) => setTargetFolder(e.target.value)}
            >
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <button type="button" className="btn" onClick={() => void runBatch('move', targetFolder)}>
              Mover
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => void runBatch('delete')}
        >
          Excluir
        </button>
      </>
    ) : null;

  return (
    <Section
      eyebrow="Inbox"
      count={activeFilters.length > 0 ? `${visible.length} de ${all.length}` : undefined}
      actions={actions}
    >
      <FilterBar label="Filtrar e-mails">
        <SearchInput
          value={query}
          onChange={setQuery}
          label="buscar e-mails"
          placeholder="assunto ou remetente"
        />
        <Chip active={onlyUnread} onClick={() => setOnlyUnread((v) => !v)}>
          Não lidos
        </Chip>
        {/* Uma caixa só não precisa de filtro por caixa. */}
        {mailboxes.length > 1 &&
          mailboxes.map((box) => (
            <Chip
              key={box.id}
              active={account === box.id}
              onClick={() => setAccount(account === box.id ? 'all' : box.id)}
            >
              {box.label}
            </Chip>
          ))}
        <select
          className="field"
          aria-label="ordenar e-mails"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          <option value="recent">Mais recentes</option>
          <option value="oldest">Mais antigos</option>
        </select>
      </FilterBar>

      <ActiveFilters filters={activeFilters} onRemove={clearFilter} onClearAll={clearAll} />

      {email.error && (
        <p role="alert" className="panel-error">
          {email.error}
        </p>
      )}
      {batchError && (
        <p role="alert" className="panel-error">
          {batchError}
        </p>
      )}

      {loading && all.length === 0 && <SkeletonRows count={6} />}

      {!loading && all.length === 0 && !email.error && (
        <EmptyState message="Caixa de entrada limpa." />
      )}

      {all.length > 0 && visible.length === 0 && (
        <EmptyState message="Nenhum e-mail com esses filtros." />
      )}

      {threads.length > 0 && (
        <ul>
          {threads.map((thread) => {
            // Uma conversa de uma mensagem abre direto no corpo: expandir para
            // clicar de novo seria um passo a mais para o caso mais comum.
            const sozinha = thread.messages.length === 1 ? thread.messages[0] : null;
            const enviadas = thread.messages.length - recebidas(thread).length;
            const isOpen = sozinha ? key(sozinha) === openKey : expanded.has(thread.id);
            const marcada = threadKeys(thread).every((k) => selected.has(k));
            const titulo = thread.subject || '(sem assunto)';
            return (
              <li key={thread.id} className={`mail-item${isOpen ? ' is-open' : ''}`}>
                <div className={`row${thread.unreadCount > 0 ? ' row-unread' : ''}`}>
                  <input
                    type="checkbox"
                    checked={marcada}
                    onChange={() => {}}
                    // O checkbox nativo não conta se o Shift estava
                    // pressionado no `change`; o clique, sim.
                    onClick={(e) => toggleSelect(thread, e.shiftKey)}
                    aria-label={`selecionar ${titulo}`}
                  />
                  <button
                    type="button"
                    className="row-main"
                    aria-expanded={isOpen}
                    onClick={() => {
                      if (sozinha) {
                        setOpenKey(isOpen ? null : key(sozinha));
                        if (!isOpen) void loadTagFolders(sozinha.account);
                        return;
                      }
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(thread.id)) next.delete(thread.id);
                        else next.add(thread.id);
                        return next;
                      });
                      void loadTagFolders(thread.messages[0].account);
                    }}
                  >
                    <span className="row-title">{titulo}</span>
                    <span className="row-meta">{thread.participants.join(', ')}</span>
                  </button>
                  {thread.messages.length > 1 && (
                    <span
                      className="row-count mono"
                      aria-label={
                        enviadas > 0
                          ? `${thread.messages.length} mensagens, ${enviadas} enviadas por você`
                          : `${thread.messages.length} mensagens`
                      }
                    >
                      {thread.messages.length}
                    </span>
                  )}
                  <span className="row-time mono">{relativeTime(thread.lastDate)}</span>
                  {mailboxes.length > 1 && (
                    <span className="row-tag">{thread.messages[0].accountLabel}</span>
                  )}
                  <div className="row-actions">
                    <div className="row-tagger">
                      <button
                        type="button"
                        className={`icon-btn${(appliedTags[thread.id] ?? []).length > 0 ? ' is-tagged' : ''}`}
                        aria-label={`etiquetar ${titulo}`}
                        aria-expanded={tagMenuKey === thread.id}
                        onClick={() => {
                          const next = tagMenuKey === thread.id ? null : thread.id;
                          setTagMenuKey(next);
                          if (next) void loadTagFolders(thread.messages[0].account);
                        }}
                      >
                        <Label width={16} height={16} />
                      </button>
                      {tagMenuKey === thread.id && (
                        <>
                          <div className="tag-scrim" onClick={() => setTagMenuKey(null)} />
                          <div className="tag-menu" role="menu" aria-label="etiquetas">
                            {(tagFolders[thread.messages[0].account] ?? []).length === 0 ? (
                              <p className="empty">Carregando etiquetas…</p>
                            ) : (
                              (tagFolders[thread.messages[0].account] ?? []).map((f) => (
                                <button
                                  key={f}
                                  type="button"
                                  role="menuitem"
                                  className="tag-menu-item"
                                  onClick={() => void applyTagToThread(thread, f)}
                                >
                                  {f}
                                </button>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      aria-label={`excluir ${titulo}`}
                      onClick={() => void removeThread(thread)}
                    >
                      <Trash width={16} height={16} />
                    </button>
                  </div>
                </div>

                {sozinha && isOpen && (
                  <EmailDetail
                    email={sozinha}
                    onClose={() => setOpenKey(null)}
                    onChanged={onChanged}
                    onSeenChanged={onSeenChanged}
                    appliedTags={appliedTags[thread.id] ?? []}
                  />
                )}

                {/* A conversa aberta mostra as mensagens na ordem em que
                    aconteceram; clicar numa delas abre o corpo. */}
                {!sozinha && isOpen && (
                  <ul className="thread-messages">
                    {thread.messages.map((m) => {
                      const aberta = key(m) === openKey;
                      return (
                        <li key={key(m)} className={`thread-message${aberta ? ' is-open' : ''}`}>
                          <button
                            type="button"
                            className={`thread-row${m.unread ? ' row-unread' : ''}${m.mailbox === 'sent' ? ' is-sent' : ''}`}
                            aria-expanded={aberta}
                            onClick={() => setOpenKey(aberta ? null : key(m))}
                          >
                            <span className="thread-from">{m.from}</span>
                            {m.mailbox === 'sent' && (
                              <span className="thread-sent">enviada</span>
                            )}
                            <span className="thread-time mono">{relativeTime(m.date)}</span>
                          </button>
                          {aberta && (
                            <EmailDetail
                              email={m}
                              onClose={() => setOpenKey(null)}
                              onChanged={onChanged}
                              onSeenChanged={onSeenChanged}
                              appliedTags={appliedTags[thread.id] ?? []}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function EmailDetail({
  email,
  onClose,
  onChanged,
  onSeenChanged,
  appliedTags,
}: {
  email: EmailEnvelope;
  onClose: () => void;
  onChanged: () => void;
  onSeenChanged: (targets: { account: string; id: string }[], seen: boolean) => void;
  appliedTags: string[];
}) {
  const [body, setBody] = useState<string | null>(null);
  const [quoted, setQuoted] = useState('');
  const [showQuoted, setShowQuoted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // O que já estiver escrito na caixa vira instrução para o rascunho ("diz que
  // eu confirmo terça"); vazia, a IA escreve a resposta do zero.
  const draftWithAi = async () => {
    setDrafting(true);
    const res = await fetch('/api/email/reply/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account: email.account,
        id: email.id,
        from: email.from,
        subject: email.subject,
        instruction: reply,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setDrafting(false);
    if (!res.ok) {
      setError(data.error ?? 'Falha ao gerar a resposta');
      return;
    }
    setError(null);
    setSent(false);
    setReply(data.text ?? '');
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    const res = await fetch('/api/email/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: email.account, id: email.id, body: reply }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? 'Falha ao enviar a resposta');
      return;
    }
    setError(null);
    setSent(true);
    setReply('');
    onChanged();
  };

  useEffect(() => {
    let cancelled = false;
    // A caixa vai junto: o mesmo uid existe na entrada e nos enviados.
    void fetch(`/api/email/${email.account}/${email.id}/body?box=${email.mailbox}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setBody(data.text ?? data.error ?? '');
        setQuoted(data.quoted ?? '');
        setShowQuoted(false);
        // Só marca como lido depois que o corpo carregou — evita marcar
        // um e-mail que o usuário nem chegou a ver por causa de erro.
        if (email.unread) {
          // O ponto de não lido some junto com a abertura, sem esperar o IMAP.
          onSeenChanged([{ account: email.account, id: email.id }], true);
          return postJson('/api/email/mark', {
            account: email.account,
            id: email.id,
            seen: true,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [email.account, email.id, email.unread, onSeenChanged]);

  // Abre logo abaixo da linha clicada, não no meio da tela: o e-mail fica
  // no lugar onde o olho já estava.
  return (
    <div className="mail-detail" aria-label="corpo do e-mail">
      <div className="mail-body">{body ?? 'Carregando…'}</div>

      {/* O histórico citado fica dobrado: numa resposta de resposta ele é a
          maior parte do texto, e é justamente a parte que já foi lida. */}
      {quoted && (
        <>
          <button
            type="button"
            className="mail-quoted-toggle"
            aria-expanded={showQuoted}
            aria-label={showQuoted ? 'esconder histórico' : 'mostrar histórico'}
            onClick={() => setShowQuoted((v) => !v)}
          >
            ···
          </button>
          {showQuoted && <div className="mail-body mail-quoted">{quoted}</div>}
        </>
      )}

      {appliedTags.length > 0 && (
        <div className="mail-tags">
          {appliedTags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="panel-error">
          {error}
        </p>
      )}

      {/* Não se responde ao próprio e-mail enviado. E, no plano prático, as
          rotas de resposta buscam a mensagem na entrada: o uid de uma enviada
          apontaria para outra coisa lá dentro. */}
      {email.mailbox === 'inbox' && (
      <div className="mail-reply">
        <textarea
          className="field mail-reply-input"
          aria-label="resposta"
          rows={4}
          placeholder="Escreva sua resposta — ou descreva o que dizer e peça o rascunho para a IA."
          value={reply}
          onChange={(e) => {
            setReply(e.target.value);
            setSent(false);
          }}
        />
        <div className="mail-reply-actions">
          <button type="button" className="btn" disabled={drafting} onClick={() => void draftWithAi()}>
            {drafting ? 'Gerando…' : 'Responder com IA'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={sending || reply.trim().length === 0}
            onClick={() => void sendReply()}
          >
            {sending ? 'Enviando…' : 'Enviar resposta'}
          </button>
          {sent && <span className="mail-reply-sent">Resposta enviada.</span>}
        </div>
      </div>
      )}

    </div>
  );
}
