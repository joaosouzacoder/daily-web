'use client';

import { useEffect, useState } from 'react';
import type { EmailEnvelope, PanelResult } from '@/lib/types';

interface Props {
  email: PanelResult<EmailEnvelope[]>;
  onChanged: () => void;
}

interface BatchTargetResult {
  account: string;
  id: string;
  ok: boolean;
  error?: string;
}

async function postJson(url: string, body: unknown) {
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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

function key(m: EmailEnvelope): string {
  return `${m.account}:${m.id}`;
}

export function EmailPanel({ email, onChanged }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [targetFolder, setTargetFolder] = useState('');

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
      new Set((email.data ?? []).filter((m) => selected.has(key(m))).map((m) => m.account)),
    );
    let cancelled = false;
    Promise.all(
      accounts.map((account) =>
        fetch(`/api/email/folders?account=${account}`)
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
  }, [selected, email.data]);

  const runBatch = async (action: 'read' | 'unread' | 'delete' | 'move', folder?: string) => {
    const targets = (email.data ?? [])
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

  const openMessage = (m: EmailEnvelope) => {
    setOpenKey(key(m));
  };

  const openMessageData = (email.data ?? []).find((m) => key(m) === openKey) ?? null;

  return (
    <section className="card" data-testid="email-panel">
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>E-mail</h2>
        {selected.size > 0 && (
          <div>
            <button onClick={() => void runBatch('read')}>marcar lido</button>
            <button onClick={() => void runBatch('unread')}>marcar não lido</button>
            <button onClick={() => void runBatch('delete')}>excluir</button>
            {folders.length > 0 && (
              <>
                <select
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
                <button onClick={() => void runBatch('move', targetFolder)}>mover</button>
              </>
            )}
          </div>
        )}
      </header>
      {email.error && <p role="alert">{email.error}</p>}
      {batchError && <p role="alert">{batchError}</p>}
      <ul>
        {(email.data ?? []).map((m) => (
          <li key={key(m)} style={{ fontWeight: m.unread ? 700 : 400 }}>
            <input
              type="checkbox"
              checked={selected.has(key(m))}
              onChange={() => toggleSelect(m)}
              aria-label={`selecionar ${m.subject}`}
            />
            <span>[{m.account === 'work' ? 'W' : 'P'}]</span>
            <button onClick={() => openMessage(m)}>
              {m.subject || '(sem assunto)'} — {m.from}
            </button>
          </li>
        ))}
      </ul>
      {openMessageData && (
        <EmailDetail email={openMessageData} onClose={() => setOpenKey(null)} onChanged={onChanged} />
      )}
    </section>
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
    let cancelled = false;
    void fetch(`/api/email/${email.account}/${email.id}/body`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setBody(data.text ?? data.error ?? '');
        // Só marca como lido depois que o corpo carregou — evita marcar
        // um e-mail que o usuário nem chegou a ver por causa de erro.
        if (email.unread) {
          return postJson('/api/email/mark', { account: email.account, id: email.id, seen: true }).then(
            onChanged,
          );
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
    <div role="dialog" aria-label="corpo do e-mail" className="card">
      <button onClick={onClose}>fechar</button>
      <h3>{email.subject}</h3>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{body ?? 'carregando…'}</pre>
      {error && <p role="alert">{error}</p>}
      <button onClick={() => void remove()}>excluir</button>
    </div>
  );
}
