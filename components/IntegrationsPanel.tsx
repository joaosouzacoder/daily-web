'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, WarningCircle } from 'iconoir-react';
import {
  MODULES,
  applyMailPreset,
  defaultsFor,
  visibleFields,
  type FieldSpec,
  type ModuleId,
} from '@/lib/modules';
import { Section } from './ui/Section';

interface ConnectionSummary {
  id: string;
  module: ModuleId;
  label: string;
  visible: Record<string, string>;
  secretsSet: string[];
  updatedAt: string;
  unreadable: boolean;
}

interface ModuleState {
  module: ModuleId;
  label: string;
  summary: string;
  multi: boolean;
  enabled: boolean;
  configured: boolean;
  connections: ConnectionSummary[];
}

interface Payload {
  vaultReady: boolean;
  mstodoAvailable: boolean;
  googleConfigured: boolean;
  googleRedirectUri: string;
  modules: ModuleState[];
}

interface CalendarRef {
  id: string;
  label: string;
  primary: boolean;
}

type Editing = { module: ModuleId; id: string | null };

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Falha na operação');
  return data;
}

function Field({
  spec,
  value,
  alreadySet,
  onChange,
  mstodoAvailable,
}: {
  spec: FieldSpec;
  value: string;
  alreadySet: boolean;
  onChange: (value: string) => void;
  mstodoAvailable: boolean;
}) {
  const id = `field-${spec.name}`;
  const options = (spec.options ?? []).filter(
    // Oferecer um provedor que não está instalado é empurrar a pessoa para
    // um erro que ela não tem como resolver pela tela.
    (option) => option.value !== 'mstodo' || mstodoAvailable,
  );

  return (
    <div className="conn-field">
      <label className="conn-label" htmlFor={id}>
        {spec.label}
        {spec.required && <span aria-hidden="true"> *</span>}
      </label>

      {spec.type === 'select' ? (
        <select
          id={id}
          className="field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className="field"
          type={spec.type === 'password' ? 'password' : spec.type === 'number' ? 'number' : 'text'}
          value={value}
          placeholder={
            // Um segredo já gravado nunca volta para a tela. O placeholder é
            // o que diferencia "está vazio" de "está guardado e não mostro".
            alreadySet && spec.secret ? '•••••••• (guardado — deixe em branco para manter)' : spec.placeholder
          }
          onChange={(e) => onChange(e.target.value)}
          autoComplete={spec.secret ? 'new-password' : 'off'}
        />
      )}

      {spec.help && <p className="conn-help">{spec.help}</p>}
    </div>
  );
}

export function IntegrationsPanel() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [openHelp, setOpenHelp] = useState<ModuleId | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; message: string } | null>(null);
  const [calendars, setCalendars] = useState<Record<string, CalendarRef[]>>({});
  const [chosenCalendars, setChosenCalendars] = useState<Record<string, string[]>>({});

  const load = async () => {
    try {
      const res = await fetch('/api/integrations');
      if (!res.ok) throw new Error('Falha ao carregar as integrações');
      setPayload(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void load();
    // O retorno do Google volta para /config com o resultado na query; ler e
    // limpar evita que a mensagem reapareça a cada recarga.
    const params = new URLSearchParams(window.location.search);
    const conectado = params.get('conectado');
    const erro = params.get('erro');
    if (conectado || erro) {
      setFlash({ ok: Boolean(conectado), message: conectado ?? erro ?? '' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Depois de conectar pelo Google, a pessoa escolhe quais agendas entram.
  const loadCalendars = async (connId: string) => {
    try {
      const res = await fetch(`/api/integrations/agenda/google/calendars?id=${connId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Falha ao listar as agendas');
      setCalendars((prev) => ({ ...prev, [connId]: data.calendars }));
      setChosenCalendars((prev) => ({
        ...prev,
        [connId]: data.selected.length > 0
          ? data.selected
          : data.calendars.filter((c: CalendarRef) => c.primary).map((c: CalendarRef) => c.id),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const saveCalendars = async (connId: string) => {
    try {
      const data = await send('/api/integrations/agenda/google/calendars', 'PATCH', {
        id: connId,
        calendarIds: chosenCalendars[connId] ?? [],
      });
      setPayload((prev) => (prev ? { ...prev, modules: data.modules } : prev));
      setCalendars((prev) => {
        const next = { ...prev };
        delete next[connId];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const startNew = (moduleId: ModuleId) => {
    setEditing({ module: moduleId, id: null });
    setValues(defaultsFor(moduleId));
    setLabel(MODULES[moduleId].multi ? '' : MODULES[moduleId].label);
    setError(null);
  };

  const startEdit = (conn: ConnectionSummary) => {
    setEditing({ module: conn.module, id: conn.id });
    setValues({ ...defaultsFor(conn.module), ...conn.visible });
    setLabel(conn.label);
    setError(null);
  };

  const cancel = () => {
    setEditing(null);
    setValues({});
    setLabel('');
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      // Só o que o formulário mostra vai no corpo. Campos ocultos (o token do
      // OAuth, a origem da agenda) são do servidor — ele os descarta de
      // qualquer forma, e mandá-los sugeriria que o cliente os controla.
      const allowed = new Set(visibleFields(editing.module, values).map((f) => f.name));
      const body = {
        label,
        values: Object.fromEntries(Object.entries(values).filter(([name]) => allowed.has(name))),
      };
      const url = editing.id
        ? `/api/integrations/${editing.module}/connections/${editing.id}`
        : `/api/integrations/${editing.module}/connections`;
      const data = await send(url, editing.id ? 'PUT' : 'POST', body);
      setPayload((prev) => (prev ? { ...prev, modules: data.modules } : prev));
      cancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (conn: ConnectionSummary) => {
    if (!window.confirm(`Remover "${conn.label}"? A credencial é apagada.`)) return;
    try {
      const data = await send(
        `/api/integrations/${conn.module}/connections/${conn.id}`,
        'DELETE',
      );
      setPayload((prev) => (prev ? { ...prev, modules: data.modules } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleModule = async (moduleId: ModuleId, enabled: boolean) => {
    try {
      const data = await send(`/api/integrations/${moduleId}`, 'PATCH', { enabled });
      setPayload((prev) => (prev ? { ...prev, modules: data.modules } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const test = async (conn: ConnectionSummary) => {
    setTesting(conn.id);
    try {
      const data = await send(`/api/integrations/${conn.module}/test`, 'POST', { id: conn.id });
      setTestResult((prev) => ({ ...prev, [conn.id]: { ok: data.ok, message: data.message } }));
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [conn.id]: { ok: false, message: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setTesting(null);
    }
  };

  const fields = useMemo(() => {
    if (!editing) return [];
    // O preset de e-mail preenche host e porta; mostrar os campos já
    // resolvidos evitaria a pergunta, mas também esconderia o que foi
    // escolhido — então eles só reaparecem no modo manual.
    return visibleFields(editing.module, values);
  }, [editing, values]);

  if (!payload) {
    return (
      <Section eyebrow="Integrações">
        {error ? (
          <p role="alert" className="panel-error">
            {error}
          </p>
        ) : (
          <p className="empty">Carregando…</p>
        )}
      </Section>
    );
  }

  return (
    <Section eyebrow="Integrações">
      {!payload.vaultReady && (
        <p role="alert" className="panel-error">
          DAILY_WEB_SECRET_KEY não está configurada no servidor. Sem ela nenhuma credencial pode ser
          guardada. Gere com <code>openssl rand -base64 32</code>.
        </p>
      )}
      {error && (
        <p role="alert" className="panel-error">
          {error}
        </p>
      )}
      {flash && (
        <p role="status" className={`conn-result${flash.ok ? ' is-ok' : ' is-bad'}`}>
          {flash.ok ? <CheckCircle width={14} height={14} /> : <WarningCircle width={14} height={14} />}
          {flash.message}
        </p>
      )}

      <p className="conn-intro">
        Cada módulo é independente e opcional. Conecte só o que você usa — o painel mostra apenas os
        que estiverem ligados.
      </p>

      {payload.modules.map((mod) => {
        const spec = MODULES[mod.module];
        const isEditing = editing?.module === mod.module;

        return (
          <article key={mod.module} className={`conn-card${mod.enabled ? ' is-on' : ''}`}>
            <header className="conn-head">
              <div className="conn-title">
                <h3>{mod.label}</h3>
                <p className="conn-summary">{mod.summary}</p>
              </div>
              <label className="conn-switch">
                <input
                  type="checkbox"
                  checked={mod.enabled}
                  onChange={(e) => void toggleModule(mod.module, e.target.checked)}
                  aria-label={`${mod.enabled ? 'desligar' : 'ligar'} ${mod.label}`}
                />
                <span>{mod.enabled ? 'Ligado' : 'Desligado'}</span>
              </label>
            </header>

            {openHelp === mod.module && (
              <ul className="conn-instructions">
                {spec.instructions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}

            {/* O Google é o caminho confiável para contas Google: o link iCal
                quebra quando o administrador bloqueia compartilhamento
                externo, e é fácil colar o link errado. */}
            {mod.module === 'agenda' && payload.googleConfigured && !isEditing && (
              <a className="btn btn-primary conn-google" href="/api/integrations/agenda/google/start">
                Conectar com Google
              </a>
            )}

            {/* Sem client no servidor, quem administra a instância precisa
                saber o que falta — e principalmente qual URI registrar, que é
                onde o setup costuma falhar. */}
            {mod.module === 'agenda' && !payload.googleConfigured && (
              <p className="conn-note">
                Para conectar contas Google, quem administra este servidor precisa definir{' '}
                <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code>. Criar o client é
                gratuito; registre esta URI de redirecionamento:{' '}
                <code className="conn-uri">{payload.googleRedirectUri}</code>
              </p>
            )}

            {mod.connections.length > 0 && (
              <ul className="conn-list">
                {mod.connections.map((conn) => {
                  const result = testResult[conn.id];
                  return (
                    <li key={conn.id} className="conn-item">
                      <div className="conn-item-main">
                        <span className="conn-item-label">{conn.label}</span>
                        {conn.unreadable ? (
                          <span className="conn-warn">
                            ilegível com a chave atual — grave de novo
                          </span>
                        ) : (
                          <span className="conn-item-detail mono">
                            {Object.values(conn.visible)[0] ?? 'configurado'}
                          </span>
                        )}
                      </div>
                      <div className="conn-item-actions">
                        <button
                          type="button"
                          className="btn"
                          disabled={testing === conn.id}
                          onClick={() => void test(conn)}
                        >
                          {testing === conn.id ? 'Testando…' : 'Testar'}
                        </button>
                        {conn.visible.provider !== 'google' && (
                          <button type="button" className="btn" onClick={() => startEdit(conn)}>
                            Editar
                          </button>
                        )}
                        {conn.visible.provider === 'google' && (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => void loadCalendars(conn.id)}
                          >
                            Escolher agendas
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => void remove(conn)}
                        >
                          Remover
                        </button>
                      </div>

                      {calendars[conn.id] && (
                        <fieldset className="conn-calendars">
                          <legend>Quais agendas mostrar</legend>
                          {calendars[conn.id].map((cal) => (
                            <label key={cal.id} className="conn-calendar">
                              <input
                                type="checkbox"
                                checked={(chosenCalendars[conn.id] ?? []).includes(cal.id)}
                                onChange={(e) =>
                                  setChosenCalendars((prev) => {
                                    const current = prev[conn.id] ?? [];
                                    return {
                                      ...prev,
                                      [conn.id]: e.target.checked
                                        ? [...current, cal.id]
                                        : current.filter((id) => id !== cal.id),
                                    };
                                  })
                                }
                              />
                              <span>{cal.label}</span>
                            </label>
                          ))}
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => void saveCalendars(conn.id)}
                          >
                            Salvar seleção
                          </button>
                        </fieldset>
                      )}
                      {result && (
                        <p className={`conn-result${result.ok ? ' is-ok' : ' is-bad'}`} role="status">
                          {result.ok ? (
                            <CheckCircle width={14} height={14} />
                          ) : (
                            <WarningCircle width={14} height={14} />
                          )}
                          {result.message}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {isEditing ? (
              <form
                className="conn-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                {spec.multi && (
                  <div className="conn-field">
                    <label className="conn-label" htmlFor="conn-label-input">
                      Nome desta conexão
                    </label>
                    <input
                      id="conn-label-input"
                      className="field"
                      value={label}
                      placeholder="Trabalho, Pessoal…"
                      onChange={(e) => setLabel(e.target.value)}
                    />
                  </div>
                )}

                {fields.map((field) => (
                  <Field
                    key={field.name}
                    spec={field}
                    value={values[field.name] ?? ''}
                    alreadySet={
                      editing.id
                        ? (mod.connections
                            .find((c) => c.id === editing.id)
                            ?.secretsSet.includes(field.name) ?? false)
                        : false
                    }
                    mstodoAvailable={payload.mstodoAvailable}
                    onChange={(value) =>
                      setValues((prev) => {
                        const next = { ...prev, [field.name]: value };
                        // Trocar de provedor preenche host e porta na hora, em
                        // vez de deixar a pessoa procurar isso na internet.
                        return field.name === 'preset' ? applyMailPreset(next) : next;
                      })
                    }
                  />
                ))}

                <div className="conn-form-actions">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Salvando…' : 'Salvar'}
                  </button>
                  <button type="button" className="btn" onClick={cancel}>
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              // Ajuda e ação na mesma linha, com separação: soltas no fluxo
              // elas encostavam uma na outra e liam como uma frase só.
              <div className="conn-actions">
                {(spec.multi || mod.connections.length === 0) && (
                  <button type="button" className="btn" onClick={() => startNew(mod.module)}>
                    {mod.connections.length === 0 ? 'Conectar' : 'Adicionar outra'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost conn-help-toggle"
                  aria-expanded={openHelp === mod.module}
                  onClick={() => setOpenHelp(openHelp === mod.module ? null : mod.module)}
                >
                  {openHelp === mod.module ? 'Esconder ajuda' : 'Como conseguir isso'}
                </button>
              </div>
            )}
          </article>
        );
      })}
    </Section>
  );
}
