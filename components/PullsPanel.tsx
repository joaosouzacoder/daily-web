'use client';

import { useEffect, useState } from 'react';
import type { PanelResult, PullRequestItem, PullsDigest } from '@/lib/types';
import { Section } from './ui/Section';
import { EmptyState } from './ui/EmptyState';
import { SkeletonRows } from './ui/Skeleton';

// Os PRs vinham como linhas de texto de uma CLI, então a única coisa a fazer
// era achar a URL no meio da frase. Agora chegam estruturados da API do
// GitHub, e a linha pode dizer de quem é e o que está esperando você.
function PullRow({ pull }: { pull: PullRequestItem }) {
  return (
    <li className="pull-row">
      <a className="pull-title" href={pull.url} target="_blank" rel="noreferrer">
        {pull.title}
      </a>
      <span className="pull-meta mono">
        {pull.repo}#{pull.number}
      </span>
      {pull.draft && <span className="row-tag">rascunho</span>}
      {pull.awaitingYou && <span className="row-tag row-tag-accent">revisar</span>}
    </li>
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

  const items = pulls.data?.items ?? [];
  // Um repositório renomeado falha sozinho; mostrar isso junto dos que deram
  // certo é mais útil do que substituir o painel inteiro por um erro.
  const repoErrors = pulls.data?.errors ?? [];

  return (
    <div className={className}>
      <Section eyebrow="Pull requests" count={items.length > 0 ? String(items.length) : undefined}>
        {pulls.error && (
          <p role="alert" className="panel-error">
            {pulls.error}
          </p>
        )}
        {repoErrors.length > 0 && (
          <p role="alert" className="panel-error">
            {repoErrors.join('; ')}
          </p>
        )}

        {loading && items.length === 0 && <SkeletonRows count={4} />}

        {!loading && items.length === 0 && !pulls.error && (
          <EmptyState message="Nada pendente nos repositórios acompanhados." />
        )}

        {items.length > 0 && (
          <ul>
            {items.map((pull) => (
              <PullRow key={`${pull.repo}#${pull.number}`} pull={pull} />
            ))}
          </ul>
        )}

        <details className="pulls-repos">
          <summary>Repositórios acompanhados</summary>
          <div className="pulls-repo-list">
            {repos.map((repo) => (
              <span key={repo} className="chip chip-removable">
                {repo}
                <button type="button" aria-label={`remover ${repo}`} onClick={() => void removeRepo(repo)}>
                  ×
                </button>
              </span>
            ))}
            {repos.length === 0 && <span className="empty">Nenhum repositório acompanhado ainda.</span>}
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
