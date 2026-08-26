import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { encrypt, decrypt } from './crypto';
import { MODULES, MODULE_IDS, defaultsFor, type ModuleId } from '@/lib/modules';

export interface Connection {
  id: string;
  module: ModuleId;
  label: string;
  values: Record<string, string>;
}

/** O que a tela recebe: nunca inclui campo marcado como secreto. */
export interface ConnectionSummary {
  id: string;
  module: ModuleId;
  label: string;
  visible: Record<string, string>;
  /** Campos secretos já gravados, só os nomes. */
  secretsSet: string[];
  updatedAt: string;
  /** Credencial ilegível — chave trocada ou registro corrompido. */
  unreadable: boolean;
}

export interface ModuleState {
  module: ModuleId;
  label: string;
  summary: string;
  multi: boolean;
  enabled: boolean;
  configured: boolean;
  connections: ConnectionSummary[];
}

interface Row {
  id: string;
  user_id: string;
  module: string;
  label: string;
  ciphertext: string;
  created_at: string;
  updated_at: string;
}

function decode(row: Row): Record<string, string> | null {
  try {
    return JSON.parse(decrypt(row.ciphertext)) as Record<string, string>;
  } catch {
    return null;
  }
}

export function listConnections(userId: string, moduleId: ModuleId): Connection[] {
  const rows = getDb()
    .prepare('SELECT * FROM connections WHERE user_id = ? AND module = ? ORDER BY created_at')
    .all(userId, moduleId) as Row[];

  return rows.flatMap((row) => {
    const values = decode(row);
    if (!values) return [];
    return [{ id: row.id, module: moduleId, label: row.label, values }];
  });
}

export function findConnection(userId: string, id: string): Connection | null {
  const row = getDb()
    .prepare('SELECT * FROM connections WHERE user_id = ? AND id = ?')
    .get(userId, id) as Row | undefined;
  if (!row) return null;
  const values = decode(row);
  if (!values) return null;
  return { id: row.id, module: row.module as ModuleId, label: row.label, values };
}

export function saveConnection(
  userId: string,
  moduleId: ModuleId,
  label: string,
  values: Record<string, string>,
  id?: string,
): string {
  const now = new Date().toISOString();
  const merged = { ...defaultsFor(moduleId), ...values };

  if (id) {
    const existing = findConnection(userId, id);
    // Campo secreto em branco na edição quer dizer "não mexe": a tela nunca
    // recebe o valor de volta, então exigir redigitar a senha a cada ajuste
    // de rótulo seria só atrito.
    if (existing) {
      for (const field of MODULES[moduleId].fields) {
        // Campo oculto nunca esteve no formulário, então o formulário não pode
        // significar "apague". O mesmo vale para segredo deixado em branco.
        const keepable = field.hidden || field.secret;
        if (keepable && !(merged[field.name] ?? '').trim() && existing.values[field.name]) {
          merged[field.name] = existing.values[field.name];
        }
      }
    }
    getDb()
      .prepare(
        `UPDATE connections SET label = ?, ciphertext = ?, updated_at = ?
         WHERE user_id = ? AND id = ?`,
      )
      .run(label, encrypt(JSON.stringify(merged)), now, userId, id);
    return id;
  }

  const newId = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO connections (id, user_id, module, label, ciphertext, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(newId, userId, moduleId, label, encrypt(JSON.stringify(merged)), now, now);
  // Cadastrar a primeira conexão liga o módulo: quem acabou de configurar
  // espera ver o painel, não um interruptor extra para descobrir.
  if (getModuleSetting(userId, moduleId) === null) setModuleEnabled(userId, moduleId, true);
  return newId;
}

export function deleteConnection(userId: string, id: string): boolean {
  return (
    getDb().prepare('DELETE FROM connections WHERE user_id = ? AND id = ?').run(userId, id)
      .changes > 0
  );
}

function getModuleSetting(userId: string, moduleId: ModuleId): boolean | null {
  const row = getDb()
    .prepare('SELECT enabled FROM module_settings WHERE user_id = ? AND module = ?')
    .get(userId, moduleId) as { enabled: number } | undefined;
  return row ? row.enabled === 1 : null;
}

export function setModuleEnabled(userId: string, moduleId: ModuleId, enabled: boolean): void {
  getDb()
    .prepare(
      `INSERT INTO module_settings (user_id, module, enabled, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, module)
       DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
    )
    .run(userId, moduleId, enabled ? 1 : 0, new Date().toISOString());
}

/** Um módulo está ligado quando foi ligado explicitamente. Sem registro, vale
 *  o fato de existir conexão: quem nunca configurou nada não deve ver painel
 *  de erro de coisa que não pediu. As tarefas são a exceção — funcionam sem
 *  credencial, então já vêm ligadas e o primeiro login não é uma tela vazia. */
export function isModuleEnabled(userId: string, moduleId: ModuleId): boolean {
  const explicit = getModuleSetting(userId, moduleId);
  if (explicit !== null) return explicit;
  if (MODULES[moduleId].alwaysAvailable) return true;
  return countConnections(userId, moduleId) > 0;
}

export function countConnections(userId: string, moduleId: ModuleId): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS total FROM connections WHERE user_id = ? AND module = ?')
    .get(userId, moduleId) as { total: number };
  return row.total;
}

export function enabledModules(userId: string): ModuleId[] {
  return MODULE_IDS.filter((moduleId) => isModuleEnabled(userId, moduleId));
}

function summarize(row: Row): ConnectionSummary {
  const moduleId = row.module as ModuleId;
  const values = decode(row);
  const visible: Record<string, string> = {};
  const secretsSet: string[] = [];

  if (values) {
    for (const field of MODULES[moduleId].fields) {
      if (field.secret) {
        if (values[field.name]) secretsSet.push(field.name);
      } else if (values[field.name]) {
        // Campo oculto não-secreto (a origem da agenda, por exemplo) volta
        // para a tela: é o que diz se a conexão é do Google ou de um link.
        visible[field.name] = values[field.name];
      }
    }
  }

  return {
    id: row.id,
    module: moduleId,
    label: row.label,
    visible,
    secretsSet,
    updatedAt: row.updated_at,
    unreadable: values === null,
  };
}

export function moduleStates(userId: string): ModuleState[] {
  const rows = getDb()
    .prepare('SELECT * FROM connections WHERE user_id = ? ORDER BY created_at')
    .all(userId) as Row[];

  return MODULE_IDS.map((moduleId) => {
    const spec = MODULES[moduleId];
    const connections = rows.filter((r) => r.module === moduleId).map(summarize);
    return {
      module: moduleId,
      label: spec.label,
      summary: spec.summary,
      multi: spec.multi,
      enabled: isModuleEnabled(userId, moduleId),
      configured: connections.length > 0,
      connections,
    };
  });
}
