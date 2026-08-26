'use client';

import { useEffect, useState } from 'react';
import { Trash } from 'iconoir-react';
import { Section } from './ui/Section';
import { EmptyState } from './ui/EmptyState';
import { SkeletonRows } from './ui/Skeleton';

interface PublicUser {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

export function UsersPanel() {
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
    if (!window.confirm(`Remover ${user.username}?`)) return;
    const res = await fetch(`/api/users/${encodeURIComponent(user.username)}`, { method: 'DELETE' });
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
        <EmptyState message="Só admins gerenciam usuários." />
      </Section>
    );
  }

  return (
    <Section eyebrow="Usuários" count={users.length > 0 ? String(users.length) : undefined}>
      {error && (
        <p role="alert" className="panel-error">
          {error}
        </p>
      )}

      <div className="config-form">
        <input
          className="field"
          aria-label="novo usuário"
          placeholder="usuário"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="field"
          type="password"
          aria-label="senha do novo usuário"
          placeholder="senha (mín. 8)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="config-check">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          admin
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !username.trim() || !password}
          onClick={() => void create()}
        >
          {saving ? 'Criando…' : 'Criar usuário'}
        </button>
      </div>

      {loading && <SkeletonRows count={3} />}

      {!loading && users.length === 0 && <EmptyState message="Nenhum usuário." />}

      {users.length > 0 && (
        <ul>
          {users.map((user) => (
            <li key={user.id}>
              <div className="row">
                <span className="row-main">
                  <span className="row-title">{user.username}</span>
                  <span className="row-meta">{user.isAdmin ? 'admin' : 'usuário'}</span>
                </span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setResetFor(resetFor === user.username ? null : user.username);
                    setResetPassword('');
                  }}
                >
                  Trocar senha
                </button>
                <div className="row-actions">
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    aria-label={`remover ${user.username}`}
                    onClick={() => void remove(user)}
                  >
                    <Trash width={16} height={16} />
                  </button>
                </div>
              </div>
              {resetFor === user.username && (
                <div className="config-form config-form-inline">
                  <input
                    className="field"
                    type="password"
                    aria-label={`nova senha de ${user.username}`}
                    placeholder="nova senha (mín. 8)"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!resetPassword}
                    onClick={() => void changePassword(user.username)}
                  >
                    Salvar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
