'use client';

import { useEffect, useMemo, useState } from 'react';
import type { EmailEnvelope, PanelResult } from '@/lib/types';
import type { ActiveFilter } from '@/lib/filters';
import { matchesQuery } from '@/lib/filters';
import { Section } from './ui/Section';
import { FilterBar } from './ui/FilterBar';
import { SearchInput } from './ui/SearchInput';
import { Chip } from './ui/Chip';
import { ActiveFilters } from './ui/ActiveFilters';
import { EmptyState } from './ui/EmptyState';
import { SkeletonRows } from './ui/Skeleton';

interface Props {
  email: PanelResult<EmailEnvelope[]>;
  onChanged: () => void;
  loading?: boolean;
}

interface BatchTargetResult {
  account: string;
  id: string;
  ok: boolean;
  error?: string;
}

type Sort = 'recent' | 'oldest';
type AccountFilter = 'all' | 'work' | 'personal';

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

export function EmailPanel({ email, onChanged, loading = false }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [targetFolder, setTargetFolder] = useState('');

  const [query, setQuery] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [account, setAccount] = useState<AccountFilter>('all');
  const [sort, setSort] = useState<Sort>('recent');

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
    ...(query.trim() ? [{ id: 'query', label: `busca: ${query.trim()}` }] : []),
    ...(onlyUnread ? [{ id: 'unread', label: 'não lidos' }] : []),
    ...(account !== 'all'
      ? [{ id: 'account', label: account === 'work' ? 'trabalho' : 'pessoal' }]
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
    const results = await postBatch(targets, action, folder);
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      setBatchError(
        `${failed.length} de ${results.length} ação(ões) falharam: ${failed
          .map((f) => `${f.account}:${f.id}${f.error ? ` (${f.error})` : ''}`)
          .join(', ')}`,
      );
      setSelected(new Set(failed.map((f) => `${f.account}:${f.id}`)));
    } else {
      setBatchError(null);
      setSelected(new Set());
    }
    onChanged();
  };

  const openMessageData = all.find((m) => key(m) === openKey) ?? null;

  const actions =
    selected.size > 0 ? (
      <>
        <span className="section-count mono">{selected.size} selecionados</span>
        <button type="button" className="btn" onClick={() => void runBatch('read')}>
          marcar lido
        </button>
        <button type="button" className="btn" onClick={() => void runBatch('unread')}>
          marcar não lido
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
              mover
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => void runBatch('delete')}
        >
          excluir
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
          não lidos
        </Chip>
        <Chip active={account === 'work'} onClick={() => setAccount(account === 'work' ? 'all' : 'work')}>
          trabalho
        </Chip>
        <Chip
          active={account === 'personal'}
          onClick={() => setAccount(account === 'personal' ? 'all' : 'personal')}
        >
          pessoal
        </Chip>
        <select
          className="field"
          aria-label="ordenar e-mails"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          <option value="recent">mais recentes</option>
          <option value="oldest">mais antigos</option>
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
          {visible.map((m) => (
            <li key={key(m)} className={`row${m.unread ? ' row-unread' : ''}`}>
              <input
                type="checkbox"
                checked={selected.has(key(m))}
                onChange={() => toggleSelect(m)}
                aria-label={`selecionar ${m.subject || '(sem assunto)'}`}
              />
              <button type="button" className="row-main" onClick={() => setOpenKey(key(m))}>
                <span className="row-title">{m.subject || '(sem assunto)'}</span>
                <span className="row-meta">{m.from}</span>
              </button>
              <span className="row-tag mono">{m.account === 'work' ? 'W' : 'P'}</span>
            </li>
          ))}
        </ul>
      )}

      {openMessageData && (
        <EmailDetail email={openMessageData} onClose={() => setOpenKey(null)} onChanged={onChanged} />
      )}
    </Section>
  );
}

function EmailDetail({
  email,
  onClose,
  onChanged,
}: {
  email: EmailEnvelope;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
          return postJson('/api/email/mark', {
            account: email.account,
            id: email.id,
            seen: true,
          }).then(onChanged);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [email.account, email.id, email.unread, onChanged]);

  const remove = async () => {
    if (!window.confirm('Excluir este e-mail?')) return;
    const [result] = await postBatch([{ account: email.account, id: email.id }], 'delete');
    if (result && !result.ok) {
      setError(result.error ?? 'falha ao excluir');
      return;
    }
    onChanged();
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="corpo do e-mail"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <span className="eyebrow">{email.from}</span>
          <h3 className="modal-title">{email.subject || '(sem assunto)'}</h3>
        </div>
        <div className="modal-body">{body ?? 'carregando…'}</div>
        {error && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-danger" onClick={() => void remove()}>
            excluir
          </button>
          <button type="button" className="btn" onClick={onClose}>
            fechar
          </button>
        </div>
      </div>
    </div>
  );
}
