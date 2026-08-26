'use client';

import { useEffect, useState } from 'react';
import { Section } from './ui/Section';
import { SkeletonRows } from './ui/Skeleton';

interface Field {
  name: string;
  label: string;
  secret: boolean;
}

interface CredentialStatus {
  provider: string;
  configured: boolean;
  updatedAt: string | null;
  visible: Record<string, string>;
}

interface Payload {
  vaultReady: boolean;
  inheritsMachineEnv: boolean;
  fields: Record<string, Field[]>;
  credentials: CredentialStatus[];
}

const LABELS: Record<string, string> = {
  jira: 'Jira',
  github: 'GitHub',
  mstodo: 'Microsoft To Do',
};

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `atualizado em ${date.toLocaleDateString('pt-BR')}`;
}

export function IntegrationsPanel() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await fetch('/api/credentials');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'Falha ao carregar integrações');
      return;
    }
    setError(null);
    setPayload(data);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (provider: string) => {
    setSaving(true);
    const res = await fetch(`/api/credentials/${provider}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: draft }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? 'Falha ao salvar');
      return;
    }
    setError(null);
    setOpenProvider(null);
    setDraft({});
    void load();
  };

  const remove = async (provider: string) => {
    if (!window.confirm(`Remover a credencial de ${LABELS[provider] ?? provider}?`)) return;
    const res = await fetch(`/api/credentials/${provider}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'Falha ao remover');
      return;
    }
    setError(null);
    void load();
  };

  if (!payload) {
    return (
      <Section eyebrow="Integrações">
        <SkeletonRows count={3} />
      </Section>
    );
  }

  return (
    <Section eyebrow="Integrações">
      {error && (
        <p role="alert" className="panel-error">
          {error}
        </p>
      )}

      {!payload.vaultReady && (
        <p role="alert" className="panel-error">
          DAILY_WEB_SECRET_KEY não configurada — sem ela as credenciais não podem ser guardadas.
        </p>
      )}

      <ul>
        {payload.credentials.map((credential) => {
          const fields = payload.fields[credential.provider] ?? [];
          const isOpen = openProvider === credential.provider;
          const visible = Object.values(credential.visible).filter(Boolean).join(' · ');
          return (
            <li key={credential.provider}>
              <div className="row">
                <span className="row-main">
                  <span className="row-title">{LABELS[credential.provider] ?? credential.provider}</span>
                  <span className="row-meta">
                    {credential.configured
                      ? [visible, formatUpdatedAt(credential.updatedAt)].filter(Boolean).join(' — ')
                      : payload.inheritsMachineEnv
                        ? 'usando a configuração da máquina'
                        : 'não configurado'}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn"
                  aria-expanded={isOpen}
                  onClick={() => {
                    setOpenProvider(isOpen ? null : credential.provider);
                    setDraft(isOpen ? {} : { ...credential.visible });
                  }}
                >
                  {credential.configured ? 'Editar' : 'Configurar'}
                </button>
                {credential.configured && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void remove(credential.provider)}
                  >
                    Remover
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="config-form config-form-inline">
                  {fields.map((field) => (
                    <input
                      key={field.name}
                      className="field"
                      type={field.secret ? 'password' : 'text'}
                      aria-label={`${LABELS[credential.provider] ?? credential.provider} — ${field.label}`}
                      placeholder={field.secret && credential.configured ? 'deixe em branco para manter' : field.label}
                      value={draft[field.name] ?? ''}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    />
                  ))}
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving || !payload.vaultReady}
                    onClick={() => void save(credential.provider)}
                  >
                    {saving ? 'Salvando…' : 'Salvar'}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
