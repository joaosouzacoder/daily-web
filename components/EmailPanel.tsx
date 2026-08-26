'use client';

import { useEffect, useMemo, useState } from 'react';
import { Label, Trash } from 'iconoir-react';
import type { Account, EmailEnvelope, MailboxRef, PanelResult } from '@/lib/types';
import type { ActiveFilter } from '@/lib/filters';
import { matchesQuery, relativeTime } from '@/lib/filters';
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

  const applyTag = async (m: EmailEnvelope, tag: string) => {
    // Copiar para a pasta marca como lida no servidor; a tela acompanha.
    onSeenChanged([{ account: m.account, id: m.id }], true);
    const res = await fetch('/api/email/tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: m.account, id: m.id, tag }),
    });
    const data = await res.json().catch(() => ({}));
    setTagMenuKey(null);
    if (!res.ok) {
      setBatchError(data.error ?? 'Falha ao aplicar etiqueta');
      onChanged();
      return;
    }
    setBatchError(null);
    setAppliedTags((prev) => {
      const current = prev[key(m)] ?? [];
      if (current.includes(tag)) return prev;
      return { ...prev, [key(m)]: [...current, tag] };
    });
    onChanged();
  };

  const removeEmail = async (m: EmailEnvelope) => {
    if (!window.confirm('Excluir este e-mail?')) return;
    const alvo = [{ account: m.account, id: m.id }];

    // Some da lista agora. Esperar a ida ao IMAP deixaria a linha parada por
    // um segundo depois do clique, como se nada tivesse acontecido.
    setBatchError(null);
    setOpenKey((prev) => (prev === key(m) ? null : prev));
    onRemoved(alvo);

    const [result] = await postBatch(alvo, 'delete');
    if (result && !result.ok) {
      setBatchError(result.error ?? 'Falha ao excluir');
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

  const toggleSelect = (m: EmailEnvelope) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = key(m);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
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

      {visible.length > 0 && (
        <ul>
          {visible.map((m) => {
            const isOpen = key(m) === openKey;
            return (
              <li key={key(m)} className={`mail-item${isOpen ? ' is-open' : ''}`}>
                <div className={`row${m.unread ? ' row-unread' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(key(m))}
                    onChange={() => toggleSelect(m)}
                    aria-label={`selecionar ${m.subject || '(sem assunto)'}`}
                  />
                  <button
                    type="button"
                    className="row-main"
                    aria-expanded={isOpen}
                    onClick={() => {
                      setOpenKey(isOpen ? null : key(m));
                      if (!isOpen) void loadTagFolders(m.account);
                    }}
                  >
                    <span className="row-title">{m.subject || '(sem assunto)'}</span>
                    <span className="row-meta">{m.from}</span>
                  </button>
                  <span className="row-time mono">{relativeTime(m.date)}</span>
                  {mailboxes.length > 1 && <span className="row-tag">{m.accountLabel}</span>}
                  <div className="row-actions">
                    <div className="row-tagger">
                      <button
                        type="button"
                        className={`icon-btn${(appliedTags[key(m)] ?? []).length > 0 ? ' is-tagged' : ''}`}
                        aria-label={`etiquetar ${m.subject || '(sem assunto)'}`}
                        aria-expanded={tagMenuKey === key(m)}
                        onClick={() => {
                          const next = tagMenuKey === key(m) ? null : key(m);
                          setTagMenuKey(next);
                          if (next) void loadTagFolders(m.account);
                        }}
                      >
                        <Label width={16} height={16} />
                      </button>
                      {tagMenuKey === key(m) && (
                        <>
                          <div className="tag-scrim" onClick={() => setTagMenuKey(null)} />
                          <div className="tag-menu" role="menu" aria-label="etiquetas">
                            {(tagFolders[m.account] ?? []).length === 0 ? (
                              <p className="empty">Carregando etiquetas…</p>
                            ) : (
                              (tagFolders[m.account] ?? []).map((f) => (
                                <button
                                  key={f}
                                  type="button"
                                  role="menuitem"
                                  className="tag-menu-item"
                                  onClick={() => void applyTag(m, f)}
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
                      aria-label={`excluir ${m.subject || '(sem assunto)'}`}
                      onClick={() => void removeEmail(m)}
                    >
                      <Trash width={16} height={16} />
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <EmailDetail
                    email={m}
                    onClose={() => setOpenKey(null)}
                    onChanged={onChanged}
                    onSeenChanged={onSeenChanged}
                    appliedTags={appliedTags[key(m)] ?? []}
                  />
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
    void fetch(`/api/email/${email.account}/${email.id}/body`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setBody(data.text ?? data.error ?? '');
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

    </div>
  );
}
