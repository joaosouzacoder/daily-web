'use client';

import { useEffect, useState } from 'react';
import type { PanelResult, PullsDigest } from '@/lib/types';

const URL_RE = /(https?:\/\/\S+)/g;

function renderLine(line: string, key: number) {
  const parts = line.split(URL_RE);
  return (
    <div key={key} style={{ whiteSpace: 'pre' }}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </div>
  );
}

interface Props {
  pulls: PanelResult<PullsDigest>;
  className?: string;
  onChanged?: () => void;
}

export function PullsPanel({ pulls, className, onChanged }: Props) {
  const [repos, setRepos] = useState<string[]>([]);
  const [newRepo, setNewRepo] = useState('');
  const [reposError, setReposError] = useState<string | null>(null);

  const loadRepos = async () => {
    const res = await fetch('/api/pulls/repos');
    if (!res.ok) return;
    const data = await res.json();
    setRepos(data.repos ?? []);
  };

  useEffect(() => {
    void loadRepos();
  }, []);

  const addRepo = async () => {
    setReposError(null);
    const res = await fetch('/api/pulls/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: newRepo.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setReposError(data.error ?? 'falha ao adicionar repositório');
      return;
    }
    setRepos(data.repos ?? []);
    setNewRepo('');
    onChanged?.();
  };

  const removeRepo = async (repo: string) => {
    setReposError(null);
    const res = await fetch('/api/pulls/repos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setReposError(data.error ?? 'falha ao remover repositório');
      return;
    }
    setRepos(data.repos ?? []);
    onChanged?.();
  };

  return (
    <section className={`card ${className ?? ''}`} data-testid="pulls-panel">
      <h2>PRs/Issues</h2>
      {pulls.error && <p role="alert">{pulls.error}</p>}
      <div>{(pulls.data?.lines ?? []).map((line, i) => renderLine(line, i))}</div>
      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {repos.map((repo) => (
            <li key={repo}>
              {repo}{' '}
              <button aria-label={`remover ${repo}`} onClick={() => void removeRepo(repo)}>
                x
              </button>
            </li>
          ))}
        </ul>
        <input
          aria-label="novo repositório"
          placeholder="owner/repo"
          value={newRepo}
          onChange={(e) => setNewRepo(e.target.value)}
        />
        <button onClick={() => void addRepo()}>adicionar</button>
        {reposError && <p role="alert">{reposError}</p>}
      </div>
    </section>
  );
}
