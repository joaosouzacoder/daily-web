'use client';

import { useEffect, useState } from 'react';
import type { PanelResult, PullsDigest } from '@/lib/types';
import { Section } from './ui/Section';
import { EmptyState } from './ui/EmptyState';
import { SkeletonRows } from './ui/Skeleton';

const URL_RE = /(https?:\/\/\S+)/g;

function renderLine(line: string, key: number) {
  const parts = line.split(URL_RE);
  return (
    <div key={key} className="pulls-line">
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
  loading?: boolean;
}

export function PullsPanel({ pulls, className, onChanged, loading = false }: Props) {
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
      setReposError(data.error ?? 'Falha ao adicionar repositório');
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
      setReposError(data.error ?? 'Falha ao remover repositório');
      return;
    }
    setRepos(data.repos ?? []);
    onChanged?.();
  };

  const lines = pulls.data?.lines ?? [];

  return (
    <div className={className}>
      <Section eyebrow="PRs & Issues">
        {pulls.error && (
          <p role="alert" className="panel-error">
            {pulls.error}
          </p>
        )}

        {loading && lines.length === 0 && <SkeletonRows count={4} />}

        {!loading && lines.length === 0 && !pulls.error && (
          <EmptyState message="Nada pendente nos repositórios rastreados." />
        )}

        {lines.length > 0 && <div>{lines.map((line, i) => renderLine(line, i))}</div>}

        <details className="pulls-repos">
          <summary>Repositórios rastreados</summary>
          <div className="pulls-repo-list">
            {repos.map((repo) => (
              <span key={repo} className="chip chip-removable">
                {repo}
                <button type="button" aria-label={`remover ${repo}`} onClick={() => void removeRepo(repo)}>
                  ×
                </button>
              </span>
            ))}
            {repos.length === 0 && <span className="empty">Nenhum repositório rastreado ainda.</span>}
          </div>
          <div className="pulls-repo-add">
            <input
              className="field"
              aria-label="novo repositório"
              placeholder="owner/repo"
              value={newRepo}
              onChange={(e) => setNewRepo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addRepo();
              }}
            />
            <button type="button" className="btn" onClick={() => void addRepo()}>
              Adicionar
            </button>
          </div>
          {reposError && (
            <p role="alert" className="panel-error">
              {reposError}
            </p>
          )}
        </details>
      </Section>
    </div>
  );
}
