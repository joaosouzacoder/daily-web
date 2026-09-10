'use client';

import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { IconAction } from '@/components/data/IconAction';
import { Trash } from 'iconoir-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/data/ConfirmDialog';
import { PanelError } from '@/components/data/PanelError';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/data/EmptyState';
import { focusRing } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Section } from './ui/Section';
import { SkeletonRows } from './ui/legacy-skeleton';

interface PublicUser {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

export function UsersPanel() {
  const { confirm, dialog } = useConfirm();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);

  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const load = async () => {
    const res = await fetch('/api/users');
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? 'Falha ao carregar usuários');
      return;
    }
    setError(null);
    setUsers(data.users ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setSaving(true);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, isAdmin }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? 'Falha ao criar usuário');
      return;
    }
    setError(null);
    setUsername('');
    setPassword('');
    setIsAdmin(false);
    void load();
  };

  const remove = async (user: PublicUser) => {
    const ok = await confirm({
      title: 'Remover o usuário?',
      description: `${user.username} perde o acesso imediatamente.`,
      confirmLabel: 'Remover',
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/users/${encodeURIComponent(user.username)}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'Falha ao remover');
      return;
    }
    setError(null);
    void load();
  };

  const changePassword = async (target: string) => {
    const res = await fetch(`/api/users/${encodeURIComponent(target)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: resetPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'Falha ao trocar a senha');
      return;
    }
    setError(null);
    setResetFor(null);
    setResetPassword('');
  };

  if (forbidden) {
    return (
      <Section eyebrow="Usuários">
        <EmptyState title="Só admins gerenciam usuários." />
      </Section>
    );
  }

  return (
    <Section eyebrow="Usuários" count={users.length > 0 ? String(users.length) : undefined}>
      {error && <PanelError>{error}</PanelError>}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-40 flex-1 basis-40"
          aria-label="novo usuário"
          placeholder="usuário"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          className="w-40 flex-1 basis-40"
          type="password"
          aria-label="senha do novo usuário"
          placeholder="senha (mín. 8)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Label className="text-ink-mid">
          <Checkbox checked={isAdmin} onCheckedChange={(checked) => setIsAdmin(checked === true)} />
          admin
        </Label>
        <Button
          type="button"
          disabled={saving || !username.trim() || !password}
          onClick={() => void create()}
        >
          {saving ? 'Criando…' : 'Criar usuário'}
        </Button>
      </div>

      {loading && <SkeletonRows count={3} />}

      {!loading && users.length === 0 && (
        <EmptyState title="Nenhum usuário." description="Crie o primeiro acesso acima." />
      )}

      {users.length > 0 && (
        <ul className="flex flex-col">
          {users.map((user) => (
            <li key={user.id} className="border-b border-line-soft last:border-b-0">
              <div className="flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-surface-2">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm text-ink">{user.username}</span>
                  <span className="row-meta type-caption truncate text-ink-dim">
                    {user.isAdmin ? 'admin' : 'usuário'}
                  </span>
                </span>
                <IconAction
                  variant="outline"
                  label="Trocar senha"
                  aria-expanded={resetFor === user.username}
                  onClick={() => {
                    setResetFor(resetFor === user.username ? null : user.username);
                    setResetPassword('');
                  }}
                  icon={<KeyRound className="size-4" />}
                />
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className={cn(
                      'flex size-7 items-center justify-center rounded-md border border-transparent text-ink-dim transition-colors hover:border-danger/40 hover:text-danger',
                      focusRing,
                    )}
                    aria-label={`remover ${user.username}`}
                    onClick={() => void remove(user)}
                  >
                    <Trash width={16} height={16} />
                  </button>
                </div>
              </div>
              {resetFor === user.username && (
                <div className="flex flex-wrap items-center gap-2 px-2 pb-3 pl-8">
                  <Input
                    className="w-48 flex-1 basis-48"
                    type="password"
                    aria-label={`nova senha de ${user.username}`}
                    placeholder="nova senha (mín. 8)"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!resetPassword}
                    onClick={() => void changePassword(user.username)}
                  >
                    Salvar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </Section>
  );
}
