'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { IconAction } from '@/components/data/IconAction';
import type { PanelResult, PullRequestItem, PullsDigest } from '@/lib/types';
import { PanelError } from '@/components/data/PanelError';
import { groupByRepo, repoUrl, type RepoGroup } from '@/lib/integrations/githubApi';
import { Section } from './ui/Section';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/data/EmptyState';
import { SkeletonRows } from './ui/legacy-skeleton';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { EM_DASH } from '@/lib/format';
import { focusRing, tabular } from '@/lib/theme';

// Os PRs vinham como linhas de texto de uma CLI, então a única coisa a fazer
// era achar a URL no meio da frase. Agora chegam estruturados da API do
// GitHub, agrupados pelo repositório de onde vêm.
function ItemRow({ item }: { item: PullRequestItem }) {
  return (
    <li className="flex items-baseline gap-3 border-b border-line-soft px-2 py-3 transition-colors duration-100 ease-brand even:bg-muted/25 last:border-b-0 hover:bg-brand-tint motion-reduce:transition-none">
      <span className={`shrink-0 text-ink-dim ${tabular}`}>#{item.number}</span>
      <a
        className="min-w-0 flex-1 truncate text-ink hover:underline"
        href={item.url}
        target="_blank"
        rel="noreferrer"
      >
        {item.title || EM_DASH}
      </a>
      {/* O autor só importa quando não é você: num repo próprio é o que
          separa o seu PR do que o dependabot abriu. */}
      {!item.mine && item.author && <span className="shrink-0 text-ink-dim">{item.author}</span>}
      {item.draft && (
        <Badge variant="secondary" className="shrink-0">
          rascunho
        </Badge>
      )}
      {item.awaitingYou && (
        <Badge variant="info" className="shrink-0">
          revisar
        </Badge>
      )}
    </li>
  );
}

function RepoBlock({ group }: { group: RepoGroup }) {
  const url = repoUrl(group.repo);
  return (
    <div className="mb-6 last:mb-0">
      <h3 className="type-subhead mb-2 border-b border-line pb-2 [&_a:hover]:underline">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            {group.repo}
          </a>
        ) : (
          group.repo
        )}
      </h3>

      {group.issues.length > 0 && (
        <div className="my-3 ml-4">
          <h4 className="type-caption mb-1 text-ink-dim">
            Issues{' '}
            <span className={`font-normal normal-case ${tabular}`}>{group.issues.length}</span>
          </h4>
          <ul className="text-sm">
            {group.issues.map((item) => (
              <ItemRow key={item.number} item={item} />
            ))}
          </ul>
        </div>
      )}

      {group.pulls.length > 0 && (
        <div className="my-3 ml-4">
          <h4 className="type-caption mb-1 text-ink-dim">
            Pull requests{' '}
            <span className={`font-normal normal-case ${tabular}`}>{group.pulls.length}</span>
          </h4>
          <ul className="text-sm">
            {group.pulls.map((item) => (
              <ItemRow key={item.number} item={item} />
            ))}
          </ul>
        </div>
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

  const items = pulls.data?.items ?? [];
  const grupos = groupByRepo(items);
  // Um repositório renomeado falha sozinho; mostrar isso junto dos que deram
  // certo é mais útil do que substituir o painel inteiro por um erro.
  const repoErrors = pulls.data?.errors ?? [];

  return (
    <div className={className}>
      <Section eyebrow="GitHub" count={items.length > 0 ? String(items.length) : undefined}>
        {pulls.error && <PanelError>{pulls.error}</PanelError>}
        {repoErrors.length > 0 && <PanelError>{repoErrors.join('; ')}</PanelError>}

        {loading && items.length === 0 && <SkeletonRows count={4} />}

        {!loading && items.length === 0 && !pulls.error && (
          <EmptyState title="Nada aberto nos repositórios acompanhados." />
        )}

        {grupos.map((group) => (
          <RepoBlock key={group.repo} group={group} />
        ))}

        <details className="mt-6 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm text-ink-dim transition-colors duration-100 ease-brand hover:text-ink-mid motion-reduce:transition-none">
            Repositórios acompanhados
          </summary>
          <div className="my-3 flex flex-wrap gap-2">
            {repos.map((repo) => (
              <span
                key={repo}
                className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface-2 py-0.5 pr-1 pl-3 text-sm text-ink-mid shadow-e1"
              >
                {repo}
                <button
                  type="button"
                  aria-label={`remover ${repo}`}
                  onClick={() => void removeRepo(repo)}
                  className={cn(
                    'rounded-full p-1 leading-none text-ink-dim transition-colors duration-100 ease-brand hover:text-danger motion-reduce:transition-none',
                    focusRing,
                  )}
                >
                  ×
                </button>
              </span>
            ))}
            {repos.length === 0 && (
              <span className="py-2 text-sm text-ink-dim">
                Nenhum repositório acompanhado ainda.
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              className="h-8 min-w-0 flex-1"
              aria-label="novo repositório"
              placeholder="owner/repo"
              value={newRepo}
              onChange={(e) => setNewRepo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addRepo();
              }}
            />
            <IconAction
              variant="outline"
              label="Adicionar repositório"
              onClick={() => void addRepo()}
              icon={<Plus className="size-4" />}
            />
          </div>
          {reposError && <PanelError>{reposError}</PanelError>}
        </details>
      </Section>
    </div>
  );
}

/**
 * A panel that cannot load is information, not an alarm: a contained block with a
 * warning rule, never loose red text competing with the sections that did load.
 */
