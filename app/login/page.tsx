'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'falha ao entrar');
        return;
      }
      router.push('/');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login">
      <form className="login-form" onSubmit={(e) => void submit(e)}>
        <div className="login-brand">
          <span className="login-mark" aria-hidden="true" />
          <h1 className="login-title">daily-web</h1>
        </div>
        <p className="login-sub">Seu dia, num relance.</p>

        <label className="login-field">
          Usuário
          <input
            className="field"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label className="login-field">
          Senha
          <input
            className="field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
          {submitting ? 'entrando' : 'entrar'}
        </button>
      </form>
    </main>
  );
}
