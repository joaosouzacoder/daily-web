# daily-web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build daily-web, um dashboard Next.js single-page (Catppuccin Mocha) com paridade completa de features com o daily-tui — e-mail, agenda, PRs, Jira, tarefas, pomodoro, notificações — atrás de login/senha, para rodar como serviço systemd nesta VPS.

**Architecture:** App Next.js 16 (App Router, TS) único deployável. Um módulo "refresher" server-side roda cada CLI (`himalaya`, `gcalcli`, `jira`, `mstodo`, `ghpending`) via `child_process` num intervalo configurável e mantém cache em memória; o front-end faz polling de `GET /api/state`. SQLite (`better-sqlite3`) guarda só o estado de notificações lidas. Autenticação é login único via env vars + cookie de sessão assinado (HMAC, Web Crypto). Lógica pura de parsing fica separada (`lib/parsers/*`) da camada que invoca CLIs (`lib/cli/*`), para nunca vazar `node:child_process` em bundles de client component.

**Tech Stack:** Next.js 16 (App Router, TS), React 19, better-sqlite3, bcryptjs, Vitest + Testing Library (jsdom), systemd, Traefik (file provider).

**Spec:** `docs/superpowers/specs/2026-08-25-daily-web-design.md`

## Global Constraints

- Next.js 16 App Router, TypeScript estrito, sem `src/` dir (raiz do repo é a raiz do app), alias `@/*` -> `./*`.
- Roda como processo host via systemd (usuário `jgabr`), NÃO em Docker.
- Escuta em `127.0.0.1:8010` (nunca `0.0.0.0` — Traefik é quem expõe publicamente).
- Nenhum segredo no repo. Runtime real vem de `/etc/daily-web/env` (fora do git); o repo só traz `.env.example`.
- `.gitignore` cobre `node_modules/`, `.next/`, `data/`, `*.db*`, `.env`, `.env.local`.
- SQLite só tem a tabela `notifications_read(source, external_id, read_at)` — nada mais persiste em disco além disso.
- Todo painel com erro de CLI mostra o erro no lugar dos dados; o resto do dashboard continua funcionando (nunca lançar exceção não tratada até o cliente).
- Lógica pura de parsing (`lib/parsers/*`, `lib/dateParsing.ts`, `lib/taskGrouping.ts`) nunca importa `node:child_process`/`node:fs` nem nada de `lib/cli/*` — só assim client components podem importá-la com segurança.
- Testes: Vitest. Parsers puros usam fixtures com o formato real das CLIs (extraído do código-fonte do daily-tui). O runner de CLI (`lib/cli/run.ts`) é testado rodando subprocessos reais (`node -e ...`), nunca mockando `child_process`. Camadas de orquestração (refresher, rotas de API) podem mockar módulos vizinhos já testados — isso é fronteira legítima, não fixture forjada substituindo o sistema real.
- Sem CI/CD, sem testes E2E (fora de escopo da spec).
- Sem multi-usuário, sem tabela de usuários — login é usuário+senha únicos vindos de env var.

---

## File Structure

```
daily-web/
  package.json, tsconfig.json, next.config.ts, vitest.config.ts
  .env.example, .gitignore, README.md
  instrumentation.ts              # boot: inicia o refresher + listener de pomodoro->ntfy
  middleware.ts                   # guarda de autenticação (Web Crypto, roda em edge OU node)
  app/
    layout.tsx, globals.css       # shell HTML + tema Catppuccin Mocha
    page.tsx                      # dashboard one-page (client component raiz)
    login/page.tsx                # tela de login
    api/
      login/route.ts, logout/route.ts
      state/route.ts, refresh/route.ts
      email/
        mark/route.ts             # POST marcar lido/não lido (um e-mail)
        batch/route.ts            # POST ação em lote (lido/não lido/excluir/mover)
        folders/route.ts          # GET pastas de uma conta
        [account]/[id]/body/route.ts
        [account]/[id]/gmail-url/route.ts
      tasks/
        route.ts                  # POST criar
        [id]/route.ts             # PATCH editar/concluir/reabrir, DELETE apagar
        [id]/subtasks/route.ts    # POST criar subtarefa
        [id]/subtasks/[itemId]/route.ts  # PATCH renomear/marcar, DELETE apagar
      pomodoro/
        start/route.ts, pause/route.ts, reset/route.ts
        notify-fallback/route.ts  # POST fallback ntfy quando Notification API falhou no cliente
      notifications/
        [id]/read/route.ts
  lib/
    types.ts                      # contrato compartilhado (DashboardState e afins)
    auth/
      password.ts, session.ts, rateLimit.ts
    cli/
      run.ts                      # runner genérico de child_process (stripAnsi, stderrSummary, runCli)
      himalaya.ts, gcalcli.ts, pulls.ts, jira.ts, mstodo.ts   # camada "invoca CLI real"
    parsers/
      himalaya.ts, gcalcli.ts, pulls.ts, jira.ts, mstodo.ts  # lógica pura, sem node:*, importável por client components
    dateParsing.ts, taskGrouping.ts
    refresher.ts                  # singleton: cache em memória + loop de refresh
    db.ts                         # better-sqlite3, cria a tabela notifications_read
    notifications.ts              # deriva notificações a partir das menções do Jira
    pomodoro.ts                   # state machine em memória do pomodoro
    hooks/usePolling.ts           # hook client-side: polling de /api/state
  components/
    Clock.tsx, Pomodoro.tsx
    EmailPanel.tsx, AgendaPanel.tsx, PullsPanel.tsx, JiraPanel.tsx
    TasksPanel.tsx, TaskFormModal.tsx
    NotificationsBell.tsx
  tests/
    setup.ts
    fixtures/
      himalaya-envelopes.json, gcalcli-agenda.tsv, jira-issues.json,
      jira-issues-tree.json, mstodo-tasks.json
    lib/... (espelha lib/, um arquivo de teste por módulo)
    components/... (espelha components/)
  deploy/
    daily-web.service, traefik-router-snippet.yml, traefik-service-snippet.yml
  scripts/
    deploy.sh
```

---

### Task 1: Scaffold do projeto (Next.js + TypeScript + Vitest + tema Catppuccin + tipos compartilhados)

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`
- Create: `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (placeholder)
- Create: `lib/types.ts`
- Create: `tests/setup.ts`

**Interfaces:**
- Produces: todos os tipos de `lib/types.ts` usados por todas as tarefas seguintes: `Account`, `EmailEnvelope`, `AgendaItem`, `PullsDigest`, `JiraItem`, `JiraParent`, `JiraRole`, `SubTask`, `TaskPriority`, `TodoTask`, `NotificationItem`, `NotificationSource`, `PomodoroPhase`, `PomodoroState`, `PanelResult<T>`, `DashboardState`.

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "daily-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 8010",
    "build": "next build",
    "start": "next start -p 8010 -H 127.0.0.1",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "16.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "better-sqlite3": "^11.3.0",
    "bcryptjs": "^2.4.3"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/better-sqlite3": "^7.6.11",
    "@types/bcryptjs": "^2.4.6",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.5.0"
  }
}
```

- [ ] **Step 2: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Criar `next.config.ts`, `vitest.config.ts`, `.gitignore`**

`next.config.ts`:
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

`.gitignore`:
```
node_modules/
.next/
data/
*.db
*.db-journal
*.db-wal
*.db-shm
.env
.env.local
next-env.d.ts
```

`tests/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Criar `lib/types.ts`**

```ts
export type Account = 'work' | 'personal';

export interface EmailEnvelope {
  id: string;
  account: Account;
  from: string;
  subject: string;
  unread: boolean;
  date: string;
}

export interface AgendaItem {
  account: Account;
  date: string;
  time: string;
  title: string;
}

export interface PullsDigest {
  lines: string[];
}

export type JiraRole = 'assignee' | 'reporter' | 'both';

export interface JiraParent {
  key: string;
  summary: string;
}

export interface JiraItem {
  key: string;
  summary: string;
  status: string;
  project: string;
  url: string;
  parent: JiraParent | null;
  role: JiraRole;
  kind: string;
  subtask: boolean;
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export type TaskPriority = 'low' | 'normal' | 'high';

export interface TodoTask {
  id: string;
  title: string;
  completed: boolean;
  due: string;
  priority: TaskPriority;
  time: string;
  recur: string;
  notes: string;
  subtasks: SubTask[];
}

export type NotificationSource = 'jira_mention';

export interface NotificationItem {
  id: string;
  source: NotificationSource;
  title: string;
  url: string;
  read: boolean;
}

export type PomodoroPhase = 'focus' | 'rest';

export interface PomodoroState {
  enabled: boolean;
  phase: PomodoroPhase;
  running: boolean;
  remainingSeconds: number;
  focusMinutes: number;
  restMinutes: number;
  completedFocusCount: number;
}

export interface PanelResult<T> {
  data: T | null;
  error: string | null;
}

export interface DashboardState {
  updatedAt: string;
  email: PanelResult<EmailEnvelope[]>;
  agenda: PanelResult<AgendaItem[]>;
  pulls: PanelResult<PullsDigest>;
  jira: PanelResult<JiraItem[]>;
  tasks: PanelResult<TodoTask[]>;
  notifications: PanelResult<NotificationItem[]>;
  pomodoro: PomodoroState;
}
```

- [ ] **Step 5: Criar tema Catppuccin Mocha e shell da app**

`app/globals.css`:
```css
:root {
  --ctp-base: #1e1e2e;
  --ctp-mantle: #181825;
  --ctp-surface0: #313244;
  --ctp-surface1: #45475a;
  --ctp-text: #cdd6f4;
  --ctp-subtext0: #a6adc8;
  --ctp-green: #a6e3a1;
  --ctp-mauve: #cba6f7;
  --ctp-red: #f38ba8;
  --ctp-yellow: #f9e2af;
  --ctp-blue: #89b4fa;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--ctp-base);
  color: var(--ctp-text);
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
}

.card {
  background: var(--ctp-surface0);
  border-radius: 8px;
  padding: 1rem;
}

.dashboard-grid {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  grid-template-columns: 1fr 1fr;
}

.dashboard-grid > .span-2 { grid-column: 1 / -1; }

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--ctp-mantle);
}
```

`app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'daily-web',
  description: 'Painel pessoal do dia a dia',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

`app/page.tsx` (placeholder — substituído na Task 19):
```tsx
export default function DashboardPage() {
  return <main>daily-web</main>;
}
```

- [ ] **Step 6: Instalar dependências e verificar que o build funciona**

Run: `cd /home/jgabr/projects/daily-web && npm install && npm run build`
Expected: build termina sem erro (a página placeholder compila).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Catppuccin theme and shared types"
```

---

### Task 2: Primitivas de autenticação (senha + sessão assinada)

**Files:**
- Create: `lib/auth/password.ts`, `lib/auth/session.ts`
- Test: `tests/lib/auth/password.test.ts`, `tests/lib/auth/session.test.ts`

**Interfaces:**
- Consumes: nenhuma (módulo raiz).
- Produces: `verifyPassword(password: string, hash: string): Promise<boolean>`, `verifyUsername(input: string, expected: string): boolean`, `createSessionToken(user: string, secret: string): Promise<string>`, `verifySessionToken(token: string, secret: string, maxAgeMs: number): Promise<SessionPayload | null>`, `interface SessionPayload { user: string; issuedAt: number }` — usados pela Task 3 (rota de login) e por `middleware.ts`.

- [ ] **Step 1: Escrever os testes de `password.ts`**

`tests/lib/auth/password.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { verifyPassword, verifyUsername } from '@/lib/auth/password';

describe('verifyPassword', () => {
  it('aceita a senha certa contra o hash bcrypt', async () => {
    const hash = await bcrypt.hash('minha-senha', 10);
    expect(await verifyPassword('minha-senha', hash)).toBe(true);
  });

  it('rejeita senha errada', async () => {
    const hash = await bcrypt.hash('minha-senha', 10);
    expect(await verifyPassword('outra-senha', hash)).toBe(false);
  });
});

describe('verifyUsername', () => {
  it('compara usuário exato', () => {
    expect(verifyUsername('joao', 'joao')).toBe(true);
    expect(verifyUsername('joao', 'Joao')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/auth/password.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/password'`.

- [ ] **Step 3: Implementar `lib/auth/password.ts`**

```ts
import bcrypt from 'bcryptjs';

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function verifyUsername(input: string, expected: string): boolean {
  return input === expected;
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/auth/password.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever os testes de `session.ts`**

`tests/lib/auth/session.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from '@/lib/auth/session';

const SECRET = 'segredo-de-teste';

describe('createSessionToken / verifySessionToken', () => {
  it('gera um token que verifica com sucesso e devolve o usuário', async () => {
    const token = await createSessionToken('joao', SECRET);
    const payload = await verifySessionToken(token, SECRET, 60_000);
    expect(payload?.user).toBe('joao');
  });

  it('rejeita token assinado com outro segredo', async () => {
    const token = await createSessionToken('joao', SECRET);
    const payload = await verifySessionToken(token, 'outro-segredo', 60_000);
    expect(payload).toBeNull();
  });

  it('rejeita token adulterado', async () => {
    const token = await createSessionToken('joao', SECRET);
    const tampered = `${token.slice(0, -2)}xx`;
    expect(await verifySessionToken(tampered, SECRET, 60_000)).toBeNull();
  });

  it('rejeita token expirado', async () => {
    const token = await createSessionToken('joao', SECRET);
    await new Promise((r) => setTimeout(r, 10));
    expect(await verifySessionToken(token, SECRET, 1)).toBeNull();
  });

  it('rejeita string mal formada', async () => {
    expect(await verifySessionToken('lixo-sem-ponto', SECRET, 60_000)).toBeNull();
  });
});
```

- [ ] **Step 6: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/auth/session.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 7: Implementar `lib/auth/session.ts`**

```ts
const encoder = new TextEncoder();

export interface SessionPayload {
  user: string;
  issuedAt: number;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString('base64url');
}

function fromBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

export async function createSessionToken(user: string, secret: string): Promise<string> {
  const payload: SessionPayload = { user, issuedAt: Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  return `${payloadB64}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
  maxAgeMs: number,
): Promise<SessionPayload | null> {
  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return null;

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(sigB64),
    encoder.encode(payloadB64),
  );
  if (!valid) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (Date.now() - payload.issuedAt > maxAgeMs) return null;
  return payload;
}
```

- [ ] **Step 8: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/auth/session.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/auth/password.ts lib/auth/session.ts tests/lib/auth/
git commit -m "feat: add password verification and signed session tokens"
```

---

### Task 3: Fluxo de login (rate limit + rotas + página + middleware)

**Files:**
- Create: `lib/auth/rateLimit.ts`
- Create: `app/api/login/route.ts`, `app/api/logout/route.ts`
- Create: `app/login/page.tsx`
- Create: `middleware.ts`
- Test: `tests/lib/auth/rateLimit.test.ts`

**Interfaces:**
- Consumes: `verifyPassword`, `verifyUsername` (Task 2, `lib/auth/password.ts`), `createSessionToken`, `verifySessionToken` (Task 2, `lib/auth/session.ts`).
- Produces: cookie `daily_web_session` (httpOnly, secure, sameSite=strict, 30 dias) que todas as rotas de API subsequentes assumem já validado pelo middleware. `isRateLimited(ip: string): boolean`, `registerFailedAttempt(ip: string): void`, `clearAttempts(ip: string): void`.

- [ ] **Step 1: Escrever o teste do rate limiter**

`tests/lib/auth/rateLimit.test.ts`:
```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { isRateLimited, registerFailedAttempt, clearAttempts } from '@/lib/auth/rateLimit';

describe('rateLimit', () => {
  beforeEach(() => clearAttempts('1.2.3.4'));

  it('não bloqueia antes do limite', () => {
    for (let i = 0; i < 4; i += 1) registerFailedAttempt('1.2.3.4');
    expect(isRateLimited('1.2.3.4')).toBe(false);
  });

  it('bloqueia ao atingir o limite de tentativas', () => {
    for (let i = 0; i < 5; i += 1) registerFailedAttempt('1.2.3.4');
    expect(isRateLimited('1.2.3.4')).toBe(true);
  });

  it('clearAttempts libera o IP', () => {
    for (let i = 0; i < 5; i += 1) registerFailedAttempt('1.2.3.4');
    clearAttempts('1.2.3.4');
    expect(isRateLimited('1.2.3.4')).toBe(false);
  });

  it('IPs diferentes têm contadores independentes', () => {
    for (let i = 0; i < 5; i += 1) registerFailedAttempt('1.2.3.4');
    expect(isRateLimited('5.6.7.8')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/auth/rateLimit.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `lib/auth/rateLimit.ts`**

```ts
interface Attempt {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, Attempt>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export function isRateLimited(ip: string): boolean {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function registerFailedAttempt(ip: string): void {
  const entry = attempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function clearAttempts(ip: string): void {
  attempts.delete(ip);
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/auth/rateLimit.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementar as rotas de login/logout**

`app/api/login/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, verifyUsername } from '@/lib/auth/password';
import { createSessionToken } from '@/lib/auth/session';
import { isRateLimited, registerFailedAttempt, clearAttempts } from '@/lib/auth/rateLimit';

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'muitas tentativas, tente mais tarde' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === 'string' ? body.username : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  const expectedUser = process.env.DASHBOARD_USER ?? '';
  const expectedHash = process.env.DASHBOARD_PASSWORD_HASH ?? '';
  const secret = process.env.SESSION_SECRET ?? '';

  if (!expectedUser || !expectedHash || !secret) {
    return NextResponse.json({ error: 'servidor sem configuração de autenticação' }, { status: 500 });
  }

  const ok = verifyUsername(username, expectedUser) && (await verifyPassword(password, expectedHash));
  if (!ok) {
    registerFailedAttempt(ip);
    return NextResponse.json({ error: 'usuário ou senha inválidos' }, { status: 401 });
  }

  clearAttempts(ip);
  const token = await createSessionToken(username, secret);
  const response = NextResponse.json({ ok: true });
  response.cookies.set('daily_web_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
  return response;
}
```

`app/api/logout/route.ts`:
```ts
import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('daily_web_session');
  return response;
}
```

- [ ] **Step 6: Implementar a página de login**

`app/login/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
  };

  return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <form onSubmit={(e) => void submit(e)} className="card">
        <h1>daily-web</h1>
        <label>
          Usuário
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Senha
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">entrar</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Implementar o middleware de autenticação**

`middleware.ts` (raiz do repo):
```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth/session';

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PUBLIC_PATHS = ['/login', '/api/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  const token = request.cookies.get('daily_web_session')?.value;
  const secret = process.env.SESSION_SECRET ?? '';
  const session = token ? await verifySessionToken(token, secret, SESSION_MAX_AGE_MS) : null;

  if (!session) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 8: Verificar que o build compila**

Run: `npm run build`
Expected: build sem erro.

- [ ] **Step 9: Commit**

```bash
git add lib/auth/rateLimit.ts app/api/login app/api/logout app/login middleware.ts tests/lib/auth/rateLimit.test.ts
git commit -m "feat: add login flow, rate limiting and auth middleware"
```

---

### Task 4: Runner genérico de CLI (`lib/cli/run.ts`)

Base de toda a camada `lib/cli/*`. Replica o contrato de erro do daily-tui (`stderr_summary` em `src/data/mod.rs`): cadeia numerada do himalaya, traceback Python, ou primeira linha significativa.

**Files:**
- Create: `lib/cli/run.ts`
- Test: `tests/lib/cli/run.test.ts`

**Interfaces:**
- Consumes: nenhuma.
- Produces: `runCli(command: string, args: string[], options?: { env?: Record<string,string>; timeoutMs?: number }): Promise<{ stdout: string; stderr: string }>`, `class CliError extends Error`, `stripAnsi(input: string): string`, `stderrSummary(raw: string): string` — usados por TODOS os módulos de `lib/cli/*` das tarefas 5-11.

- [ ] **Step 1: Escrever os testes**

`tests/lib/cli/run.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { runCli, stripAnsi, stderrSummary, CliError } from '@/lib/cli/run';

describe('stripAnsi', () => {
  it('remove sequências de escape ANSI mantendo o texto', () => {
    expect(stripAnsi('\x1b[36mrepo\x1b[39m')).toBe('repo');
  });

  it('não altera texto sem escapes', () => {
    expect(stripAnsi('texto normal')).toBe('texto normal');
  });
});

describe('stderrSummary', () => {
  it('pega a causa mais funda da cadeia numerada do himalaya', () => {
    const raw = 'Error:\n0: cannot list envelopes\n1: cannot refresh access token\nNote: Run with --trace';
    expect(stderrSummary(raw)).toBe('cannot refresh access token');
  });

  it('pega a última linha de um traceback Python', () => {
    const raw = 'Traceback (most recent call last):\n  File "x.py", line 1\nConnectionError: falha de rede';
    expect(stderrSummary(raw)).toBe('ConnectionError: falha de rede');
  });

  it('pega a primeira linha significativa quando não há padrão conhecido', () => {
    expect(stderrSummary('defina JIRA_TOKEN')).toBe('defina JIRA_TOKEN');
  });

  it('devolve mensagem padrão quando o stderr está vazio', () => {
    expect(stderrSummary('')).toBe('sem detalhes no stderr');
    expect(stderrSummary('   \n  \n')).toBe('sem detalhes no stderr');
  });
});

describe('runCli', () => {
  it('resolve com stdout quando o comando termina com sucesso', async () => {
    const result = await runCli(process.execPath, ['-e', "process.stdout.write('ok')"]);
    expect(result.stdout).toBe('ok');
  });

  it('rejeita com CliError quando o comando sai com código diferente de zero', async () => {
    await expect(
      runCli(process.execPath, ['-e', "process.stderr.write('deu ruim'); process.exit(1)"]),
    ).rejects.toThrow(CliError);
  });

  it('a mensagem do CliError usa o resumo do stderr', async () => {
    await expect(
      runCli(process.execPath, ['-e', "process.stderr.write('deu ruim'); process.exit(1)"]),
    ).rejects.toThrow(/deu ruim/);
  });

  it('rejeita com CliError quando o comando não existe', async () => {
    await expect(runCli('comando-que-nao-existe-daily-web', [])).rejects.toThrow(CliError);
  });

  it('rejeita quando o comando estoura o timeout', async () => {
    await expect(
      runCli(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { timeoutMs: 100 }),
    ).rejects.toThrow();
  });

  it('passa env extra para o subprocesso', async () => {
    const result = await runCli(
      process.execPath,
      ['-e', 'process.stdout.write(process.env.MEU_VALOR ?? "")'],
      { env: { MEU_VALOR: 'abc123' } },
    );
    expect(result.stdout).toBe('abc123');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/cli/run.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `lib/cli/run.ts`**

```ts
import { execFile } from 'node:child_process';

export interface CliResult {
  stdout: string;
  stderr: string;
}

export class CliError extends Error {
  constructor(
    public readonly command: string,
    message: string,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

const PY_TRACEBACK = 'Traceback (most recent call last):';

export function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, '');
}

export function stderrSummary(raw: string): string {
  const clean = stripAnsi(raw);
  const meaningful = clean
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('Note:') && l !== 'Error:');

  if (meaningful.length === 0) {
    return 'sem detalhes no stderr';
  }

  if (meaningful[0] === PY_TRACEBACK) {
    return meaningful[meaningful.length - 1] ?? PY_TRACEBACK;
  }

  const deepestCause = [...meaningful].reverse().find((l) => {
    const idx = l.indexOf(': ');
    if (idx === -1) return false;
    return /^\d+$/.test(l.slice(0, idx));
  });
  if (deepestCause) {
    return deepestCause.slice(deepestCause.indexOf(': ') + 2);
  }

  return meaningful[0];
}

export function runCli(
  command: string,
  args: string[],
  options: { env?: Record<string, string>; timeoutMs?: number } = {},
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...options.env },
        timeout: options.timeoutMs ?? 30_000,
        maxBuffer: 10 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            reject(new CliError(command, `falha ao executar ${command}: comando não encontrado`));
            return;
          }
          reject(new CliError(command, `${command} falhou: ${stderrSummary(stderr)}`));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/cli/run.test.ts`
Expected: PASS (todos os testes, incluindo os que spawnam subprocessos reais).

- [ ] **Step 5: Commit**

```bash
git add lib/cli/run.ts tests/lib/cli/run.test.ts
git commit -m "feat: add generic CLI runner with ANSI stripping and error summarization"
```

---

### Task 5: Parser e leitura de e-mail — himalaya

Separado em `lib/parsers/himalaya.ts` (puro, importável por client components) e `lib/cli/himalaya.ts` (invoca a CLI de verdade via `runCli`).

**Files:**
- Create: `lib/parsers/himalaya.ts`, `lib/cli/himalaya.ts`
- Create: `tests/fixtures/himalaya-envelopes.json`
- Test: `tests/lib/parsers/himalaya.test.ts`

**Interfaces:**
- Consumes: `Account`, `EmailEnvelope` (Task 1, `lib/types.ts`); `runCli` (Task 4, `lib/cli/run.ts`).
- Produces: (parsers, puro) `parseEnvelopes(json: string, account: Account): EmailEnvelope[]`, `sortRecentFirst(items: EmailEnvelope[]): EmailEnvelope[]`, `readable(raw: string): string`, `decodeEntities(input: string): string`, `parseMessageId(raw: string): string | null`. (cli) `listEnvelopes(account: Account, limit: number): Promise<EmailEnvelope[]>`, `fetchBody(account: Account, id: string): Promise<string>` — usados pela Task 20 (UI) e Task 15 (refresher).

- [ ] **Step 1: Criar a fixture com a forma real de `himalaya envelope list -o json`**

`tests/fixtures/himalaya-envelopes.json`:
```json
[
  {
    "id": "142",
    "flags": ["Seen"],
    "subject": "Re: revisão do PR #482",
    "from": { "name": "Milton Yoshida", "addr": "milton.yoshida@example.com" },
    "date": "2026-08-24 09:15+00:00"
  },
  {
    "id": "143",
    "flags": [],
    "subject": null,
    "from": { "name": "", "addr": "no-reply@github.com" },
    "date": "2026-08-24 10:02+00:00"
  }
]
```

- [ ] **Step 2: Escrever os testes de `lib/parsers/himalaya.ts`**

`tests/lib/parsers/himalaya.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnvelopes, sortRecentFirst, readable, parseMessageId } from '@/lib/parsers/himalaya';

const fixture = readFileSync(
  path.join(__dirname, '../../fixtures/himalaya-envelopes.json'),
  'utf8',
);

describe('parseEnvelopes', () => {
  it('marca como lido quando a flag Seen está presente', () => {
    const items = parseEnvelopes(fixture, 'work');
    expect(items[0].unread).toBe(false);
  });

  it('marca como não lido quando falta a flag Seen', () => {
    const items = parseEnvelopes(fixture, 'work');
    expect(items[1].unread).toBe(true);
  });

  it('usa o endereço quando o nome do remetente está vazio', () => {
    const items = parseEnvelopes(fixture, 'work');
    expect(items[1].from).toBe('no-reply@github.com');
  });

  it('trata subject nulo como string vazia', () => {
    const items = parseEnvelopes(fixture, 'work');
    expect(items[1].subject).toBe('');
  });

  it('marca a conta de origem em cada item', () => {
    const items = parseEnvelopes(fixture, 'personal');
    expect(items.every((i) => i.account === 'personal')).toBe(true);
  });
});

describe('sortRecentFirst', () => {
  it('ordena do mais recente para o mais antigo', () => {
    const items = parseEnvelopes(fixture, 'work');
    const sorted = sortRecentFirst([...items].reverse());
    expect(sorted[0].id).toBe('143');
  });
});

describe('readable', () => {
  it('devolve texto puro sem alteração além de colapsar linhas em branco', () => {
    expect(readable('linha 1\n\n\n\nlinha 2')).toBe('linha 1\n\nlinha 2');
  });

  it('converte HTML simples em texto legível', () => {
    const html = '<html><body><p>Olá</p><p>Segunda linha</p></body></html>';
    expect(readable(html)).toBe('Olá\n\nSegunda linha');
  });

  it('remove conteúdo de <script> e <style>', () => {
    const html = '<html><head><style>.a{color:red}</style></head><body><p>Texto</p><script>alert(1)</script></body></html>';
    expect(readable(html)).toBe('Texto');
  });

  it('decodifica entidades HTML acentuadas', () => {
    const html = '<p>Escritório &amp; equipe</p>';
    expect(readable(html)).toBe('Escritório & equipe');
  });
});

describe('parseMessageId', () => {
  it('extrai o Message-ID sem os colchetes', () => {
    const raw = 'Message-ID: <abc123@mail.example.com>\n\ncorpo aqui';
    expect(parseMessageId(raw)).toBe('abc123@mail.example.com');
  });

  it('devolve null quando não há header', () => {
    expect(parseMessageId('sem header aqui')).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/parsers/himalaya.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar `lib/parsers/himalaya.ts`**

```ts
import type { Account, EmailEnvelope } from '@/lib/types';

interface RawAddr {
  name?: string | null;
  addr?: string | null;
}

interface RawEnvelope {
  id: string;
  flags?: string[] | null;
  subject?: string | null;
  from?: RawAddr | null;
  date?: string | null;
}

export function parseEnvelopes(json: string, account: Account): EmailEnvelope[] {
  const raw: RawEnvelope[] = JSON.parse(json);
  return raw.map((env) => {
    const flags = env.flags ?? [];
    const from = env.from ?? {};
    const name = from.name ?? '';
    const addr = from.addr ?? '';
    return {
      id: env.id,
      account,
      from: name.trim() ? name : addr,
      subject: env.subject ?? '',
      unread: !flags.some((f) => f.toLowerCase() === 'seen'),
      date: env.date ?? '',
    };
  });
}

function parseDate(raw: string): number {
  const t = Date.parse(raw.replace(' ', 'T'));
  return Number.isNaN(t) ? -Infinity : t;
}

export function sortRecentFirst(items: EmailEnvelope[]): EmailEnvelope[] {
  return [...items].sort((a, b) => parseDate(b.date) - parseDate(a.date));
}

export function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)));
}

function collapseBlankLines(raw: string): string {
  return raw
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeHtml(raw: string): boolean {
  return /<\s*(html|body|table|div|p|br)\b/i.test(raw);
}

const BLOCK_TAGS_RE = /<\/?(p|br|div|tr|li|h[1-6]|table|ul|ol)\b[^>]*>/gi;

export function readable(raw: string): string {
  if (!looksLikeHtml(raw)) {
    return collapseBlankLines(raw);
  }
  const withoutScripts = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const withBreaks = withoutScripts.replace(BLOCK_TAGS_RE, '\n');
  const withoutTags = withBreaks.replace(/<[^>]+>/g, '');
  return collapseBlankLines(decodeEntities(withoutTags));
}

export function parseMessageId(raw: string): string | null {
  for (const line of raw.split('\n')) {
    const match = /^(message-id):\s*(.+)$/i.exec(line.trim());
    if (match) {
      const value = match[2].trim().replace(/^</, '').replace(/>$/, '');
      return value || null;
    }
  }
  return null;
}

const FOLDER_ALIASES = ['inbox', 'sent', 'drafts', 'trash', 'spam', 'all'];

export function sortFolders(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const rankA = FOLDER_ALIASES.indexOf(a.toLowerCase());
    const rankB = FOLDER_ALIASES.indexOf(b.toLowerCase());
    const ra = rankA === -1 ? FOLDER_ALIASES.length : rankA;
    const rb = rankB === -1 ? FOLDER_ALIASES.length : rankB;
    if (ra !== rb) return ra - rb;
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/parsers/himalaya.test.ts`
Expected: PASS.

- [ ] **Step 6: Implementar `lib/cli/himalaya.ts` (camada que invoca a CLI de verdade)**

Sem teste unitário próprio: são funções finas que só compõem `runCli` com a lógica pura já testada acima (não há CLI real disponível no ambiente de teste para gerar uma saída autêntica, e mockar `child_process` recriaria a mesma fixture à mão — sem valor sobre o que a Task 4 e o Step 5 já cobrem).

```ts
import { runCli } from './run';
import { parseEnvelopes, sortRecentFirst, readable, parseMessageId, sortFolders } from '@/lib/parsers/himalaya';
import type { Account, EmailEnvelope } from '@/lib/types';

export async function listEnvelopes(account: Account, limit: number): Promise<EmailEnvelope[]> {
  const { stdout } = await runCli('himalaya', [
    'envelope', 'list', '-a', account, '--page-size', String(limit), '-o', 'json',
  ]);
  return sortRecentFirst(parseEnvelopes(stdout, account));
}

export async function listFolders(account: Account): Promise<string[]> {
  const { stdout } = await runCli('himalaya', ['folder', 'list', '-a', account, '-o', 'json']);
  const raw: { name: string }[] = JSON.parse(stdout);
  return sortFolders(raw.map((f) => f.name));
}

export async function setSeen(account: Account, id: string, seen: boolean): Promise<void> {
  await runCli('himalaya', ['flag', seen ? 'add' : 'remove', id, 'seen', '-a', account]);
}

const DELETE_FOLDER = 'trash';

export async function moveTo(account: Account, id: string, folder: string): Promise<void> {
  await runCli('himalaya', ['message', 'move', folder, id, '-a', account]);
}

export async function deleteEmail(account: Account, id: string): Promise<void> {
  await moveTo(account, id, DELETE_FOLDER);
}

export async function fetchBody(account: Account, id: string): Promise<string> {
  const { stdout } = await runCli('himalaya', [
    'message', 'read', id, '-a', account, '--no-headers', '--preview',
  ]);
  return readable(stdout);
}

export async function gmailUrl(account: Account, id: string): Promise<string | null> {
  const { stdout } = await runCli('himalaya', [
    'message', 'read', id, '-a', account, '-H', 'Message-ID', '--preview',
  ]);
  const messageId = parseMessageId(stdout);
  if (!messageId) return null;
  return `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(messageId)}`;
}
```

- [ ] **Step 7: Verificar que o build compila**

Run: `npm run build`

- [ ] **Step 8: Commit**

```bash
git add lib/parsers/himalaya.ts lib/cli/himalaya.ts tests/lib/parsers/himalaya.test.ts tests/fixtures/himalaya-envelopes.json
git commit -m "feat: add himalaya email parsing and CLI integration"
```

---

### Task 6: Parser e busca de agenda — gcalcli

**Files:**
- Create: `lib/parsers/gcalcli.ts`, `lib/cli/gcalcli.ts`
- Create: `tests/fixtures/gcalcli-agenda.tsv`
- Test: `tests/lib/parsers/gcalcli.test.ts`

**Interfaces:**
- Consumes: `Account`, `AgendaItem` (Task 1); `runCli` (Task 4).
- Produces: `parseAgendaTsv(tsv: string, account: Account): AgendaItem[]`, `fetchAgenda(account: Account): Promise<AgendaItem[]>` — usados pela Task 15 (refresher) e Task 21 (UI).

- [ ] **Step 1: Criar a fixture com a forma real de `gcalcli agenda --tsv`**

`tests/fixtures/gcalcli-agenda.tsv`:
```
start_date	start_time	end_date	end_time	title
2026-08-26	14:00	2026-08-26	15:00	Daily
2026-08-27		2026-08-28		Feriado
```

- [ ] **Step 2: Escrever os testes**

`tests/lib/parsers/gcalcli.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseAgendaTsv } from '@/lib/parsers/gcalcli';

const fixture = readFileSync(path.join(__dirname, '../../fixtures/gcalcli-agenda.tsv'), 'utf8');

describe('parseAgendaTsv', () => {
  it('descarta a linha de cabeçalho', () => {
    expect(parseAgendaTsv(fixture, 'work')).toHaveLength(2);
  });

  it('reconhece evento com horário', () => {
    const items = parseAgendaTsv(fixture, 'work');
    expect(items[0]).toEqual({ account: 'work', date: '2026-08-26', time: '14:00', title: 'Daily' });
  });

  it('reconhece evento de dia inteiro (sem horário)', () => {
    const items = parseAgendaTsv(fixture, 'personal');
    expect(items[1].time).toBe('');
    expect(items[1].title).toBe('Feriado');
  });

  it('ignora linhas em branco', () => {
    expect(parseAgendaTsv('', 'work')).toEqual([]);
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/parsers/gcalcli.test.ts`

- [ ] **Step 4: Implementar `lib/parsers/gcalcli.ts`**

```ts
import type { Account, AgendaItem } from '@/lib/types';

export function parseAgendaTsv(tsv: string, account: Account): AgendaItem[] {
  return tsv
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .filter((line) => !line.startsWith('start_date'))
    .flatMap((line) => {
      const cols = line.split('\t');
      const date = (cols[0] ?? '').trim();
      const time = (cols[1] ?? '').trim();
      const title = (cols[4] ?? '').trim();
      if (!date) return [];
      return [{ account, date, time, title }];
    });
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/parsers/gcalcli.test.ts`

- [ ] **Step 6: Implementar `lib/cli/gcalcli.ts`**

```ts
import path from 'node:path';
import os from 'node:os';
import { runCli } from './run';
import { parseAgendaTsv } from '@/lib/parsers/gcalcli';
import type { Account, AgendaItem } from '@/lib/types';

const ACCOUNT_ENV: Record<Account, string> = {
  work: 'WORK_CALENDAR_EMAIL',
  personal: 'PERSONAL_CALENDAR_EMAIL',
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function fetchAgenda(account: Account): Promise<AgendaItem[]> {
  const calendar = process.env[ACCOUNT_ENV[account]] ?? '';
  if (!calendar) {
    throw new Error(`e-mail da calendar de ${account} não configurado (${ACCOUNT_ENV[account]})`);
  }
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  const dataHome = path.join(os.homedir(), '.local/share/gcalcli-accounts', account);

  const { stdout } = await runCli(
    'gcalcli',
    ['--calendar', calendar, 'agenda', toIsoDate(today), toIsoDate(end), '--tsv'],
    { env: { XDG_DATA_HOME: dataHome } },
  );
  return parseAgendaTsv(stdout, account);
}
```

- [ ] **Step 7: Commit**

```bash
git add lib/parsers/gcalcli.ts lib/cli/gcalcli.ts tests/lib/parsers/gcalcli.test.ts tests/fixtures/gcalcli-agenda.tsv
git commit -m "feat: add gcalcli agenda parsing and CLI integration"
```

---

### Task 7: Parser e busca de PRs/issues — ghpending

Diferente do daily-tui (que preserva os escapes ANSI e reaplica cor no terminal), a versão web remove o ANSI e renderiza texto puro — não se justifica reimplementar um interpretador de cores ANSI numa página HTML.

**Files:**
- Create: `lib/parsers/pulls.ts`, `lib/cli/pulls.ts`
- Test: `tests/lib/parsers/pulls.test.ts`

**Interfaces:**
- Consumes: `PullsDigest` (Task 1); `runCli`, `stripAnsi` (Task 4).
- Produces: `parsePulls(raw: string): string[]`, `fetchPulls(): Promise<PullsDigest>` — usados pela Task 15 e Task 21.

- [ ] **Step 1: Escrever os testes**

`tests/lib/parsers/pulls.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parsePulls } from '@/lib/parsers/pulls';

describe('parsePulls', () => {
  it('remove linhas em branco nas pontas mas preserva as do meio', () => {
    expect(parsePulls('\n\na\n\nb\n\n')).toEqual(['a', '', 'b']);
  });

  it('devolve lista vazia quando não há conteúdo', () => {
    expect(parsePulls('')).toEqual([]);
    expect(parsePulls('\n\n')).toEqual([]);
  });

  it('preserva o conteúdo de uma linha só', () => {
    expect(parsePulls('só uma linha')).toEqual(['só uma linha']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/parsers/pulls.test.ts`

- [ ] **Step 3: Implementar `lib/parsers/pulls.ts`**

```ts
export function parsePulls(raw: string): string[] {
  const lines = raw.split('\n').map((l) => l.replace(/\s+$/, ''));
  const start = lines.findIndex((l) => l.trim().length > 0);
  if (start === -1) return [];
  let end = lines.length - 1;
  while (end >= 0 && lines[end].trim().length === 0) end -= 1;
  return lines.slice(start, end + 1);
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/parsers/pulls.test.ts`

- [ ] **Step 5: Implementar `lib/cli/pulls.ts`**

```ts
import { runCli, stripAnsi } from './run';
import { parsePulls } from '@/lib/parsers/pulls';
import type { PullsDigest } from '@/lib/types';

export async function fetchPulls(): Promise<PullsDigest> {
  const { stdout } = await runCli('ghpending', []);
  return { lines: parsePulls(stripAnsi(stdout)) };
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/parsers/pulls.ts lib/cli/pulls.ts tests/lib/parsers/pulls.test.ts
git commit -m "feat: add ghpending digest parsing and CLI integration"
```

---

### Task 8: Parser e busca do Jira

**Files:**
- Create: `lib/parsers/jira.ts`, `lib/cli/jira.ts`
- Create: `tests/fixtures/jira-issues.json`, `tests/fixtures/jira-issues-tree.json`
- Test: `tests/lib/parsers/jira.test.ts`

**Interfaces:**
- Consumes: `JiraItem`, `JiraParent`, `JiraRole` (Task 1); `runCli` (Task 4).
- Produces: `parseIssues(json: string): JiraItem[]`, `typeMarker(kind: string): string`, `issueMarker(item: JiraItem): string`, `interface JiraGroup { parentKey: string | null; parentSummary: string; issues: JiraItem[] }`, `groupByParent(items: JiraItem[]): JiraGroup[]`, `type JiraFilter = 'assignee' | 'reporter' | 'both'`, `fetchIssues(filter: JiraFilter): Promise<JiraItem[]>`, `fetchMentions(): Promise<JiraItem[]>` — usados pela Task 15, Task 16 (notificações) e Task 22 (UI).

- [ ] **Step 1: Criar as fixtures (conteúdo inventado, mesma forma da saída real do helper `jira`)**

`tests/fixtures/jira-issues.json`:
```json
[
  {
    "key": "ENG-101",
    "summary": "[Painel] - Melhorias no dashboard de métricas",
    "status": "Em andamento",
    "project": "ENG",
    "url": "https://example.atlassian.net/browse/ENG-101",
    "type": "História",
    "parent": { "key": "ENG-1", "summary": "Iniciativa de Engenharia" }
  },
  {
    "key": "OPS-55",
    "summary": "Revisão de configuração de acesso",
    "status": "Em Andamento",
    "project": "OPS",
    "url": "https://example.atlassian.net/browse/OPS-55",
    "parent": null
  },
  {
    "key": "OPS-56",
    "summary": "Atualização de rotina de backup",
    "status": "Em Andamento",
    "project": "OPS",
    "url": "https://example.atlassian.net/browse/OPS-56",
    "parent": null
  }
]
```

`tests/fixtures/jira-issues-tree.json`:
```json
[
  {
    "key": "ENG-1", "summary": "Plataforma", "status": "Em andamento", "project": "ENG",
    "url": "u", "type": "Iniciativa", "parent": null, "subtask": false, "role": "assignee"
  },
  {
    "key": "ENG-9", "summary": "Ajustar o import", "status": "Em andamento", "project": "ENG",
    "url": "u", "type": "Subtarefa", "subtask": true, "role": "both",
    "parent": { "key": "ENG-7", "summary": "Importar planilha" }
  },
  {
    "key": "ENG-7", "summary": "Importar planilha", "status": "Em andamento", "project": "ENG",
    "url": "u", "type": "História", "subtask": false, "role": "reporter",
    "parent": { "key": "ENG-1", "summary": "Plataforma" }
  }
]
```

- [ ] **Step 2: Escrever os testes**

`tests/lib/parsers/jira.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseIssues, typeMarker, issueMarker, groupByParent } from '@/lib/parsers/jira';

const real = readFileSync(path.join(__dirname, '../../fixtures/jira-issues.json'), 'utf8');
const tree = readFileSync(path.join(__dirname, '../../fixtures/jira-issues-tree.json'), 'utf8');

describe('parseIssues', () => {
  it('faz o parse do contrato real do helper jira', () => {
    const items = parseIssues(real);
    expect(items).toHaveLength(3);
    expect(items[0].key).toBe('ENG-101');
    expect(items[0].status).toBe('Em andamento');
    expect(items[0].parent).toEqual({ key: 'ENG-1', summary: 'Iniciativa de Engenharia' });
    expect(items[1].parent).toBeNull();
  });

  it('usa "assignee" como role padrão quando ausente', () => {
    const items = parseIssues(real);
    expect(items[0].role).toBe('assignee');
  });
});

describe('typeMarker', () => {
  it('reconhece o tipo nos dois idiomas', () => {
    expect(typeMarker('História')).toBe('[S]');
    expect(typeMarker('Story')).toBe('[S]');
    expect(typeMarker('Epic')).toBe('[E]');
    expect(typeMarker('Épico')).toBe('[E]');
    expect(typeMarker('Iniciativa')).toBe('[I]');
    expect(typeMarker('Objetivo')).toBe('[O]');
  });

  it('reconhece requisição de serviço em várias formas', () => {
    expect(typeMarker('[System] Service request')).toBe('[R]');
    expect(typeMarker('Requisição')).toBe('[R]');
  });

  it('devolve [?] para tipo desconhecido', () => {
    expect(typeMarker('Subtarefa')).toBe('[?]');
    expect(typeMarker('')).toBe('[?]');
  });
});

describe('issueMarker', () => {
  it('usa [s] para subtarefa mesmo quando o nome do tipo não é reconhecido', () => {
    const items = parseIssues(tree);
    const subtask = items.find((i) => i.key === 'ENG-9')!;
    expect(typeMarker(subtask.kind)).toBe('[?]');
    expect(issueMarker(subtask)).toBe('[s]');
  });

  it('história segue com o marcador do tipo', () => {
    const items = parseIssues(tree);
    const story = items.find((i) => i.key === 'ENG-7')!;
    expect(issueMarker(story)).toBe('[S]');
  });
});

describe('groupByParent', () => {
  it('agrupa issues pelo pai e junta as sem pai em "sem pai"', () => {
    const groups = groupByParent(parseIssues(real));
    const withParent = groups.find((g) => g.parentKey === 'ENG-1');
    expect(withParent?.issues.map((i) => i.key)).toEqual(['ENG-101']);
    const orphanGroup = groups.find((g) => g.parentKey === null);
    expect(orphanGroup?.issues.map((i) => i.key).sort()).toEqual(['OPS-55', 'OPS-56']);
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/parsers/jira.test.ts`

- [ ] **Step 4: Implementar `lib/parsers/jira.ts`**

```ts
import type { JiraItem, JiraRole } from '@/lib/types';

interface RawJiraItem {
  key: string;
  summary: string;
  status: string;
  project: string;
  url: string;
  parent?: { key: string; summary: string } | null;
  role?: JiraRole;
  type?: string;
  subtask?: boolean;
}

export function parseIssues(json: string): JiraItem[] {
  const raw: RawJiraItem[] = JSON.parse(json);
  return raw.map((item) => ({
    key: item.key,
    summary: item.summary,
    status: item.status,
    project: item.project,
    url: item.url,
    parent: item.parent ? { key: item.parent.key, summary: item.parent.summary } : null,
    role: item.role ?? 'assignee',
    kind: item.type ?? '',
    subtask: item.subtask ?? false,
  }));
}

const TYPE_MARKERS: Record<string, string> = {
  'história': '[S]', historia: '[S]', story: '[S]',
  epic: '[E]', 'épico': '[E]', epico: '[E]',
  iniciativa: '[I]', initiative: '[I]',
  objetivo: '[O]', objective: '[O]',
  '[system] service request': '[R]', 'service request': '[R]',
  'solicitação de serviço': '[R]', 'solicitacao de servico': '[R]',
  'pedido de serviço': '[R]', 'pedido de servico': '[R]',
  'requisição': '[R]', requisicao: '[R]',
};

export function typeMarker(kind: string): string {
  return TYPE_MARKERS[kind.trim().toLowerCase()] ?? '[?]';
}

export function issueMarker(item: JiraItem): string {
  return item.subtask ? '[s]' : typeMarker(item.kind);
}

export interface JiraGroup {
  parentKey: string | null;
  parentSummary: string;
  issues: JiraItem[];
}

export function groupByParent(items: JiraItem[]): JiraGroup[] {
  const groups = new Map<string, JiraGroup>();
  const orphans: JiraItem[] = [];
  for (const item of items) {
    if (!item.parent) {
      orphans.push(item);
      continue;
    }
    const existing = groups.get(item.parent.key);
    if (existing) {
      existing.issues.push(item);
    } else {
      groups.set(item.parent.key, {
        parentKey: item.parent.key,
        parentSummary: item.parent.summary,
        issues: [item],
      });
    }
  }
  const result = [...groups.values()];
  if (orphans.length > 0) {
    result.push({ parentKey: null, parentSummary: 'sem pai', issues: orphans });
  }
  return result;
}

export type JiraFilter = 'assignee' | 'reporter' | 'both';
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/parsers/jira.test.ts`

- [ ] **Step 6: Implementar `lib/cli/jira.ts`**

```ts
import { runCli } from './run';
import { parseIssues, type JiraFilter } from '@/lib/parsers/jira';
import type { JiraItem } from '@/lib/types';

export async function fetchIssues(filter: JiraFilter): Promise<JiraItem[]> {
  const { stdout } = await runCli('jira', ['issues', '--filter', filter]);
  return parseIssues(stdout);
}

export async function fetchMentions(): Promise<JiraItem[]> {
  const { stdout } = await runCli('jira', ['mentions']);
  return parseIssues(stdout);
}
```

`JIRA_CLOUD`, `JIRA_EMAIL` e `JIRA_TOKEN` já chegam ao subprocesso porque `runCli` propaga `process.env` inteiro (Task 4) — não é preciso repassá-los explicitamente aqui.

- [ ] **Step 7: Commit**

```bash
git add lib/parsers/jira.ts lib/cli/jira.ts tests/lib/parsers/jira.test.ts tests/fixtures/jira-issues.json tests/fixtures/jira-issues-tree.json
git commit -m "feat: add Jira issue parsing, grouping and CLI integration"
```

---

### Task 9: Parser de leitura do Microsoft To Do — mstodo

**Files:**
- Create: `lib/parsers/mstodo.ts`, `lib/cli/mstodo.ts` (só leitura nesta task; escrita na Task 10)
- Create: `tests/fixtures/mstodo-tasks.json`
- Test: `tests/lib/parsers/mstodo.test.ts`

**Interfaces:**
- Consumes: `TodoTask`, `SubTask`, `TaskPriority` (Task 1); `runCli` (Task 4).
- Produces: `parseTasks(json: string): TodoTask[]`, `fetchTasks(): Promise<TodoTask[]>` — usados pela Task 15 e Task 23 (UI).

- [ ] **Step 1: Criar a fixture (conteúdo inventado, mesma forma da saída real de `mstodo list`)**

`tests/fixtures/mstodo-tasks.json`:
```json
[
  {
    "id": "T1", "title": "Trocar a instalação elétrica", "completed": false, "due": "", "notes": "",
    "priority": "high", "time": "", "recur": "",
    "subtasks": [
      { "id": "S1", "title": "Medir a fiação", "completed": true },
      { "id": "S2", "title": "Comprar disjuntor", "completed": false }
    ]
  },
  {
    "id": "T2", "title": "Sem etapas", "completed": false, "due": "2026-08-30", "notes": "",
    "priority": "normal", "time": "14:00", "recur": "weekly", "subtasks": []
  }
]
```

- [ ] **Step 2: Escrever os testes**

`tests/lib/parsers/mstodo.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseTasks } from '@/lib/parsers/mstodo';

const fixture = readFileSync(path.join(__dirname, '../../fixtures/mstodo-tasks.json'), 'utf8');

describe('parseTasks', () => {
  it('faz o parse dos campos básicos', () => {
    const raw = '[{"id":"a1","title":"Comprar café","completed":false,"due":"2026-06-10","notes":""},' +
      '{"id":"b2","title":"Feito","completed":true,"due":"","notes":"obs"}]';
    const tasks = parseTasks(raw);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe('Comprar café');
    expect(tasks[0].due).toBe('2026-06-10');
    expect(tasks[1].completed).toBe(true);
    expect(tasks[1].notes).toBe('obs');
  });

  it('faz o parse das subtarefas mantendo o estado', () => {
    const tasks = parseTasks(fixture);
    expect(tasks[0].subtasks).toHaveLength(2);
    expect(tasks[0].subtasks[0]).toEqual({ id: 'S1', title: 'Medir a fiação', completed: true });
    expect(tasks[1].subtasks).toEqual([]);
  });

  it('campo subtasks ausente vira lista vazia', () => {
    const tasks = parseTasks('[{"id":"a","title":"t","completed":false}]');
    expect(tasks[0].subtasks).toEqual([]);
  });

  it('prioridade ausente ou inválida vira "normal"', () => {
    const tasks = parseTasks('[{"id":"a","title":"t","completed":false,"priority":"esquisita"}]');
    expect(tasks[0].priority).toBe('normal');
  });

  it('prioridade válida é preservada', () => {
    const tasks = parseTasks(fixture);
    expect(tasks[0].priority).toBe('high');
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/parsers/mstodo.test.ts`

- [ ] **Step 4: Implementar `lib/parsers/mstodo.ts`**

```ts
import type { SubTask, TaskPriority, TodoTask } from '@/lib/types';

interface RawSubtask {
  id: string;
  title: string;
  completed: boolean;
}

interface RawTask {
  id: string;
  title: string;
  completed: boolean;
  due?: string;
  priority?: string;
  time?: string;
  recur?: string;
  notes?: string;
  subtasks?: RawSubtask[];
}

const VALID_PRIORITIES: readonly string[] = ['low', 'normal', 'high'];

function toPriority(value: string | undefined): TaskPriority {
  return VALID_PRIORITIES.includes(value ?? '') ? (value as TaskPriority) : 'normal';
}

export function parseTasks(json: string): TodoTask[] {
  const raw: RawTask[] = JSON.parse(json);
  return raw.map((task) => ({
    id: task.id,
    title: task.title,
    completed: task.completed,
    due: task.due ?? '',
    priority: toPriority(task.priority),
    time: task.time ?? '',
    recur: task.recur ?? '',
    notes: task.notes ?? '',
    subtasks: (task.subtasks ?? []).map(
      (s): SubTask => ({ id: s.id, title: s.title, completed: s.completed }),
    ),
  }));
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/parsers/mstodo.test.ts`

- [ ] **Step 6: Implementar leitura em `lib/cli/mstodo.ts`**

```ts
import { runCli } from './run';
import { parseTasks } from '@/lib/parsers/mstodo';
import type { TodoTask } from '@/lib/types';

export async function fetchTasks(): Promise<TodoTask[]> {
  const { stdout } = await runCli('mstodo', ['list']);
  return parseTasks(stdout);
}
```

- [ ] **Step 7: Commit**

```bash
git add lib/parsers/mstodo.ts lib/cli/mstodo.ts tests/lib/parsers/mstodo.test.ts tests/fixtures/mstodo-tasks.json
git commit -m "feat: add mstodo task list parsing and CLI integration"
```

---

### Task 10: Escrita de tarefas — mstodo (CRUD + subtarefas)

**Files:**
- Modify: `lib/cli/mstodo.ts`
- Test: `tests/lib/cli/mstodo-write.test.ts`

**Interfaces:**
- Consumes: `runCli` (Task 4); `TaskPriority` (Task 1).
- Produces: `type Recur = 'none' | 'daily' | 'weekly' | 'monthly'`, `interface EditTaskInput { title?: string; due?: string; time?: string; recur?: Recur; priority?: TaskPriority }`, `buildEditArgs(id: string, input: EditTaskInput): string[]`, `addTask(title: string): Promise<string>`, `completeTask(id: string): Promise<void>`, `reopenTask(id: string): Promise<void>`, `editTask(id: string, input: EditTaskInput): Promise<void>`, `deleteTask(id: string): Promise<void>`, `addSubtask(taskId: string, title: string): Promise<void>`, `editSubtask(taskId: string, itemId: string, title: string): Promise<void>`, `deleteSubtask(taskId: string, itemId: string): Promise<void>`, `checkSubtask(taskId: string, itemId: string, checked: boolean): Promise<void>` — usados pela Task 18 (rotas de API) e Task 23 (UI).

`buildEditArgs` fica isolado como função pura para ser testável sem invocar `mstodo` de verdade — as demais funções desta task são wrappers finos de uma linha em torno de `runCli`, sem lógica própria que justifique mock de `child_process`.

- [ ] **Step 1: Escrever o teste de `buildEditArgs`**

`tests/lib/cli/mstodo-write.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildEditArgs } from '@/lib/cli/mstodo';

describe('buildEditArgs', () => {
  it('inclui só os campos informados', () => {
    expect(buildEditArgs('T1', { title: 'Novo título' })).toEqual(['T1', '--title', 'Novo título']);
  });

  it('monta todos os campos quando presentes', () => {
    expect(
      buildEditArgs('T1', { due: '2026-08-30', time: '14:00', recur: 'weekly', priority: 'high' }),
    ).toEqual(['T1', '--due', '2026-08-30', '--time', '14:00', '--recur', 'weekly', '--priority', 'high']);
  });

  it('aceita "none" para limpar data/hora/repetição', () => {
    expect(buildEditArgs('T1', { due: 'none', time: 'none', recur: 'none' })).toEqual([
      'T1', '--due', 'none', '--time', 'none', '--recur', 'none',
    ]);
  });

  it('sem campos extras devolve só o id', () => {
    expect(buildEditArgs('T1', {})).toEqual(['T1']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/cli/mstodo-write.test.ts`

- [ ] **Step 3: Adicionar as funções de escrita em `lib/cli/mstodo.ts`**

Acrescentar ao arquivo criado na Task 9 (mantendo `fetchTasks` já existente):

```ts
import type { TaskPriority } from '@/lib/types';

export type Recur = 'none' | 'daily' | 'weekly' | 'monthly';

export interface EditTaskInput {
  title?: string;
  due?: string;
  time?: string;
  recur?: Recur;
  priority?: TaskPriority;
}

export function buildEditArgs(id: string, input: EditTaskInput): string[] {
  const args = [id];
  if (input.title !== undefined) args.push('--title', input.title);
  if (input.due !== undefined) args.push('--due', input.due);
  if (input.time !== undefined) args.push('--time', input.time);
  if (input.recur !== undefined) args.push('--recur', input.recur);
  if (input.priority !== undefined) args.push('--priority', input.priority);
  return args;
}

export async function addTask(title: string): Promise<string> {
  const { stdout } = await runCli('mstodo', ['add', title]);
  return stdout.trim();
}

export async function completeTask(id: string): Promise<void> {
  await runCli('mstodo', ['complete', id]);
}

export async function reopenTask(id: string): Promise<void> {
  await runCli('mstodo', ['reopen', id]);
}

export async function editTask(id: string, input: EditTaskInput): Promise<void> {
  await runCli('mstodo', ['edit', ...buildEditArgs(id, input)]);
}

export async function deleteTask(id: string): Promise<void> {
  await runCli('mstodo', ['delete', id]);
}

export async function addSubtask(taskId: string, title: string): Promise<void> {
  await runCli('mstodo', ['subtask', taskId, title]);
}

export async function editSubtask(taskId: string, itemId: string, title: string): Promise<void> {
  await runCli('mstodo', ['subtask-edit', taskId, itemId, title]);
}

export async function deleteSubtask(taskId: string, itemId: string): Promise<void> {
  await runCli('mstodo', ['subtask-delete', taskId, itemId]);
}

export async function checkSubtask(taskId: string, itemId: string, checked: boolean): Promise<void> {
  await runCli('mstodo', [checked ? 'check' : 'uncheck', taskId, itemId]);
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/cli/mstodo-write.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/cli/mstodo.ts tests/lib/cli/mstodo-write.test.ts
git commit -m "feat: add mstodo write actions (CRUD, subtasks)"
```

---

### Task 11: Parsing de data para o formulário de tarefas

Regras do README do daily-tui: `AAAA-MM-DD`, `hoje`, `amanhã`/`amanha` e `+Nd`, cada um com hora opcional `HH:MM` no fim; vazio limpa a data.

**Files:**
- Create: `lib/dateParsing.ts`
- Test: `tests/lib/dateParsing.test.ts`

**Interfaces:**
- Consumes: nenhuma.
- Produces: `interface ParsedDue { due: string; time: string }`, `parseDueInput(input: string, now?: Date): ParsedDue` (lança `Error` com mensagem em português quando não parseia) — usado pela Task 17 (rota POST/PATCH de tarefas) e Task 23 (formulário).

- [ ] **Step 1: Escrever os testes**

`tests/lib/dateParsing.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseDueInput } from '@/lib/dateParsing';

describe('parseDueInput', () => {
  const now = new Date('2026-08-25T12:00:00Z');

  it('vazio limpa a data e a hora', () => {
    expect(parseDueInput('', now)).toEqual({ due: 'none', time: 'none' });
  });

  it('interpreta "hoje"', () => {
    expect(parseDueInput('hoje', now)).toEqual({ due: '2026-08-25', time: 'none' });
  });

  it('interpreta "amanhã" com e sem acento', () => {
    expect(parseDueInput('amanhã', now).due).toBe('2026-08-26');
    expect(parseDueInput('amanha', now).due).toBe('2026-08-26');
  });

  it('interpreta "+3d"', () => {
    expect(parseDueInput('+3d', now).due).toBe('2026-08-28');
  });

  it('aceita AAAA-MM-DD', () => {
    expect(parseDueInput('2026-09-01', now).due).toBe('2026-09-01');
  });

  it('aceita hora opcional no fim', () => {
    expect(parseDueInput('hoje 14:30', now)).toEqual({ due: '2026-08-25', time: '14:30' });
    expect(parseDueInput('2026-08-20 09:00', now)).toEqual({ due: '2026-08-20', time: '09:00' });
  });

  it('rejeita data que não parseia', () => {
    expect(() => parseDueInput('32/13', now)).toThrow('data inválida');
  });

  it('rejeita data calendário-inválida', () => {
    expect(() => parseDueInput('2026-02-30', now)).toThrow('data inválida');
  });

  it('rejeita hora que não parseia', () => {
    expect(() => parseDueInput('hoje 25:00', now)).toThrow('hora inválida');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/dateParsing.test.ts`

- [ ] **Step 3: Implementar `lib/dateParsing.ts`**

```ts
export interface ParsedDue {
  due: string;
  time: string;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RELATIVE_RE = /^\+(\d+)d$/;

function isValidDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDueInput(input: string, now: Date = new Date()): ParsedDue {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { due: 'none', time: 'none' };
  }

  const parts = trimmed.split(/\s+/);
  const datePart = parts[0].toLowerCase();
  const timePart = parts[1];

  let due: string;
  if (datePart === 'hoje') {
    due = toIso(now);
  } else if (datePart === 'amanhã' || datePart === 'amanha') {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 1);
    due = toIso(d);
  } else {
    const relative = RELATIVE_RE.exec(datePart);
    if (relative) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + Number(relative[1]));
      due = toIso(d);
    } else {
      const iso = ISO_RE.exec(datePart);
      if (!iso) {
        throw new Error(`data inválida: ${parts[0]}`);
      }
      const [, y, m, d] = iso;
      if (!isValidDate(Number(y), Number(m), Number(d))) {
        throw new Error(`data inválida: ${parts[0]}`);
      }
      due = datePart;
    }
  }

  if (timePart === undefined) {
    return { due, time: 'none' };
  }
  if (!TIME_RE.test(timePart)) {
    throw new Error(`hora inválida: ${timePart} — use HH:MM`);
  }
  return { due, time: timePart };
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/dateParsing.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/dateParsing.ts tests/lib/dateParsing.test.ts
git commit -m "feat: add due-date input parsing for the task form"
```

---

### Task 12: Agrupamento de tarefas por faixa de prazo

Regras do README: ATRASADAS / HOJE / ESTA SEMANA / ESTE MÊS / DEPOIS / SEM DATA, janelas móveis de 7 e 30 dias a partir de hoje, faixa vazia não aparece, dentro da faixa ordena por vencimento e depois prioridade, concluídas no fim.

**Files:**
- Create: `lib/taskGrouping.ts`
- Test: `tests/lib/taskGrouping.test.ts`

**Interfaces:**
- Consumes: `TodoTask`, `TaskPriority` (Task 1).
- Produces: `type TaskGroupKey = 'overdue' | 'today' | 'week' | 'month' | 'later' | 'noDate'`, `interface TaskGroupResult { key: TaskGroupKey; label: string; tasks: TodoTask[] }`, `groupTasksByDueWindow(tasks: TodoTask[], today?: Date): TaskGroupResult[]` — usado pela Task 23 (UI).

- [ ] **Step 1: Escrever os testes**

`tests/lib/taskGrouping.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { groupTasksByDueWindow } from '@/lib/taskGrouping';
import type { TodoTask } from '@/lib/types';

const today = new Date('2026-08-25T12:00:00Z');

function task(over: Partial<TodoTask>): TodoTask {
  return {
    id: over.id ?? 'x', title: over.title ?? 't', completed: over.completed ?? false,
    due: over.due ?? '', priority: over.priority ?? 'normal', time: '', recur: '', notes: '',
    subtasks: [],
  };
}

describe('groupTasksByDueWindow', () => {
  it('separa em atrasada/hoje/semana/mês/depois/sem data, nessa ordem', () => {
    const tasks = [
      task({ id: 'a', due: '2026-08-20' }),
      task({ id: 'b', due: '2026-08-25' }),
      task({ id: 'c', due: '2026-08-28' }),
      task({ id: 'd', due: '2026-09-15' }),
      task({ id: 'e', due: '2026-12-01' }),
      task({ id: 'f', due: '' }),
    ];
    const groups = groupTasksByDueWindow(tasks, today);
    expect(groups.map((g) => g.key)).toEqual(['overdue', 'today', 'week', 'month', 'later', 'noDate']);
  });

  it('omite faixas vazias', () => {
    const groups = groupTasksByDueWindow([task({ due: '2026-08-25' })], today);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('today');
    expect(groups[0].label).toBe('HOJE');
  });

  it('ordena por vencimento, depois prioridade, concluídas no fim', () => {
    const tasks = [
      task({ id: 'low', due: '2026-08-25', priority: 'low' }),
      task({ id: 'high', due: '2026-08-25', priority: 'high' }),
      task({ id: 'done', due: '2026-08-25', priority: 'high', completed: true }),
    ];
    const groups = groupTasksByDueWindow(tasks, today);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['high', 'low', 'done']);
  });

  it('tarefa sem data cai em SEM DATA independente de estar completada', () => {
    const groups = groupTasksByDueWindow([task({ due: '', completed: true })], today);
    expect(groups[0].key).toBe('noDate');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/taskGrouping.test.ts`

- [ ] **Step 3: Implementar `lib/taskGrouping.ts`**

```ts
import type { TaskPriority, TodoTask } from '@/lib/types';

export type TaskGroupKey = 'overdue' | 'today' | 'week' | 'month' | 'later' | 'noDate';

const GROUP_LABELS: Record<TaskGroupKey, string> = {
  overdue: 'ATRASADAS',
  today: 'HOJE',
  week: 'ESTA SEMANA',
  month: 'ESTE MÊS',
  later: 'DEPOIS',
  noDate: 'SEM DATA',
};

const GROUP_ORDER: TaskGroupKey[] = ['overdue', 'today', 'week', 'month', 'later', 'noDate'];

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function groupOf(due: string, todayIso: string, weekEndIso: string, monthEndIso: string): TaskGroupKey {
  if (due === '') return 'noDate';
  if (due < todayIso) return 'overdue';
  if (due === todayIso) return 'today';
  if (due <= weekEndIso) return 'week';
  if (due <= monthEndIso) return 'month';
  return 'later';
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

export interface TaskGroupResult {
  key: TaskGroupKey;
  label: string;
  tasks: TodoTask[];
}

export function groupTasksByDueWindow(tasks: TodoTask[], today: Date = new Date()): TaskGroupResult[] {
  const todayIso = today.toISOString().slice(0, 10);
  const weekEndIso = addDays(todayIso, 6);
  const monthEndIso = addDays(todayIso, 29);

  const buckets = new Map<TaskGroupKey, TodoTask[]>();
  for (const t of tasks) {
    const key = groupOf(t.due, todayIso, weekEndIso, monthEndIso);
    const list = buckets.get(key) ?? [];
    list.push(t);
    buckets.set(key, list);
  }

  for (const list of buckets.values()) {
    list.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.due !== b.due) return a.due < b.due ? -1 : 1;
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    });
  }

  return GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    label: GROUP_LABELS[key],
    tasks: buckets.get(key)!,
  }));
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/taskGrouping.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/taskGrouping.ts tests/lib/taskGrouping.test.ts
git commit -m "feat: add task grouping by due-date window"
```

---

### Task 13: Refresher (cache em memória) + rotas de leitura do estado

**Files:**
- Create: `lib/refresher.ts`
- Create: `app/api/state/route.ts`, `app/api/refresh/route.ts`
- Test: `tests/lib/refresher.test.ts`

**Interfaces:**
- Consumes: `DashboardState`, `PanelResult` (Task 1); `listEnvelopes` (Task 5); `fetchAgenda` (Task 6); `fetchPulls` (Task 7); `fetchIssues` (Task 8); `fetchTasks` (Task 9); `getNotifications` (Task 15 — ver nota abaixo); `getPomodoroState` (Task 16 — ver nota abaixo).
- Produces: `refreshAll(): Promise<DashboardState>`, `getCachedState(): DashboardState | null`, `startRefreshLoop(intervalSeconds: number): void` — usados pela Task 14 (SQLite, via `getNotifications`) e Task 21 (boot em `instrumentation.ts`).

Nota de ordem: esta task referencia `getNotifications` (Task 14) e `getPomodoroState` (Task 15), que ainda não existem. Como o teste desta task mocka esses dois módulos (não os exercita de verdade — a integração real deles é testada nas próprias tasks 14 e 15), a implementação pode seguir com módulos "stub" mínimos que a Task 14/15 substituem depois. Para evitar retrabalho, esta task já cria `lib/notifications.ts` e `lib/pomodoro.ts` com as assinaturas completas (a Task 14 acrescenta SQLite a `notifications.ts`, a Task 15 acrescenta a state machine a `pomodoro.ts` — nenhuma delas muda a assinatura usada aqui).

- [ ] **Step 1: Escrever os testes**

`tests/lib/refresher.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cli/himalaya', () => ({ listEnvelopes: vi.fn() }));
vi.mock('@/lib/cli/gcalcli', () => ({ fetchAgenda: vi.fn() }));
vi.mock('@/lib/cli/pulls', () => ({ fetchPulls: vi.fn() }));
vi.mock('@/lib/cli/jira', () => ({ fetchIssues: vi.fn() }));
vi.mock('@/lib/cli/mstodo', () => ({ fetchTasks: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ getNotifications: vi.fn() }));
vi.mock('@/lib/pomodoro', () => ({
  getPomodoroState: vi.fn(() => ({
    enabled: true, phase: 'focus', running: false, remainingSeconds: 1500,
    focusMinutes: 25, restMinutes: 5, completedFocusCount: 0,
  })),
}));

import { listEnvelopes } from '@/lib/cli/himalaya';
import { fetchAgenda } from '@/lib/cli/gcalcli';
import { fetchPulls } from '@/lib/cli/pulls';
import { fetchIssues } from '@/lib/cli/jira';
import { fetchTasks } from '@/lib/cli/mstodo';
import { getNotifications } from '@/lib/notifications';
import { refreshAll, getCachedState } from '@/lib/refresher';

beforeEach(() => {
  vi.mocked(listEnvelopes).mockResolvedValue([]);
  vi.mocked(fetchAgenda).mockResolvedValue([]);
  vi.mocked(fetchPulls).mockResolvedValue({ lines: [] });
  vi.mocked(fetchIssues).mockResolvedValue([]);
  vi.mocked(fetchTasks).mockResolvedValue([]);
  vi.mocked(getNotifications).mockResolvedValue([]);
});

describe('refreshAll', () => {
  it('preenche o estado quando todas as fontes respondem', async () => {
    const state = await refreshAll();
    expect(state.email.error).toBeNull();
    expect(state.jira.data).toEqual([]);
    expect(state.pomodoro.phase).toBe('focus');
  });

  it('isola o erro de um painel sem derrubar os outros', async () => {
    vi.mocked(fetchIssues).mockRejectedValue(new Error('JIRA_TOKEN ausente'));
    const state = await refreshAll();
    expect(state.jira.error).toBe('JIRA_TOKEN ausente');
    expect(state.jira.data).toEqual([]);
    expect(state.email.error).toBeNull();
  });

  it('busca e-mail e agenda das duas contas', async () => {
    await refreshAll();
    expect(listEnvelopes).toHaveBeenCalledWith('work', 30);
    expect(listEnvelopes).toHaveBeenCalledWith('personal', 30);
    expect(fetchAgenda).toHaveBeenCalledWith('work');
    expect(fetchAgenda).toHaveBeenCalledWith('personal');
  });

  it('getCachedState devolve null antes do primeiro refresh e o estado depois', async () => {
    expect(getCachedState()).toBeNull();
    await refreshAll();
    expect(getCachedState()).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/refresher.test.ts`
Expected: FAIL — nenhum dos módulos (`lib/notifications.ts`, `lib/pomodoro.ts`, `lib/refresher.ts`) existe ainda.

- [ ] **Step 3: Criar os stubs mínimos de `lib/notifications.ts` e `lib/pomodoro.ts`**

`lib/notifications.ts` (a Task 14 adiciona SQLite e `markRead`/`isRead` aqui, sem mudar esta assinatura):
```ts
import type { NotificationItem } from '@/lib/types';

export async function getNotifications(): Promise<NotificationItem[]> {
  return [];
}
```

`lib/pomodoro.ts` (a Task 15 substitui o corpo por uma state machine de verdade, mantendo esta assinatura):
```ts
import type { PomodoroState } from '@/lib/types';

export function getPomodoroState(): PomodoroState {
  return {
    enabled: true, phase: 'focus', running: false, remainingSeconds: 25 * 60,
    focusMinutes: 25, restMinutes: 5, completedFocusCount: 0,
  };
}
```

- [ ] **Step 4: Implementar `lib/refresher.ts`**

```ts
import type { DashboardState, PanelResult } from '@/lib/types';
import { listEnvelopes } from './cli/himalaya';
import { fetchAgenda } from './cli/gcalcli';
import { fetchPulls } from './cli/pulls';
import { fetchIssues } from './cli/jira';
import { fetchTasks } from './cli/mstodo';
import { getNotifications } from './notifications';
import { getPomodoroState } from './pomodoro';

const EMAIL_LIMIT = 30;
const JIRA_FILTER = 'both' as const;

async function panel<T>(fn: () => Promise<T>): Promise<PanelResult<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

let cache: DashboardState | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export async function refreshAll(): Promise<DashboardState> {
  const [email, agenda, pulls, jira, tasks, notifications] = await Promise.all([
    panel(async () => {
      const [work, personal] = await Promise.all([
        listEnvelopes('work', EMAIL_LIMIT),
        listEnvelopes('personal', EMAIL_LIMIT),
      ]);
      return [...work, ...personal];
    }),
    panel(async () => {
      const [work, personal] = await Promise.all([fetchAgenda('work'), fetchAgenda('personal')]);
      return [...work, ...personal];
    }),
    panel(() => fetchPulls()),
    panel(() => fetchIssues(JIRA_FILTER)),
    panel(() => fetchTasks()),
    panel(() => getNotifications()),
  ]);

  cache = {
    updatedAt: new Date().toISOString(),
    email,
    agenda,
    pulls,
    jira,
    tasks,
    notifications,
    pomodoro: getPomodoroState(),
  };
  return cache;
}

export function getCachedState(): DashboardState | null {
  if (!cache) return null;
  return { ...cache, pomodoro: getPomodoroState() };
}

export function startRefreshLoop(intervalSeconds: number): void {
  if (timer) return;
  void refreshAll();
  timer = setInterval(() => void refreshAll(), intervalSeconds * 1000);
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/refresher.test.ts`

- [ ] **Step 6: Implementar as rotas de API**

`app/api/state/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { getCachedState, refreshAll } from '@/lib/refresher';

export async function GET() {
  const state = getCachedState() ?? (await refreshAll());
  return NextResponse.json(state);
}
```

`app/api/refresh/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { refreshAll } from '@/lib/refresher';

export async function POST() {
  const state = await refreshAll();
  return NextResponse.json(state);
}
```

- [ ] **Step 7: Verificar que o build compila**

Run: `npm run build`

- [ ] **Step 8: Commit**

```bash
git add lib/refresher.ts lib/notifications.ts lib/pomodoro.ts app/api/state app/api/refresh tests/lib/refresher.test.ts
git commit -m "feat: add background refresher with in-memory cache and state API"
```

---

### Task 14: SQLite + notificações (menções do Jira)

**Files:**
- Create: `lib/db.ts`
- Modify: `lib/notifications.ts` (substitui o stub da Task 13)
- Create: `app/api/notifications/[id]/read/route.ts`
- Test: `tests/lib/notifications.test.ts`

**Interfaces:**
- Consumes: `fetchMentions` (Task 8); `NotificationItem`, `NotificationSource` (Task 1).
- Produces: `getDb(): Database.Database`, `isRead(source: string, externalId: string): boolean`, `markRead(source: string, externalId: string): void`, `getNotifications(): Promise<NotificationItem[]>` (mesma assinatura da Task 13, agora com persistência de verdade) — usados pela Task 13 (refresher) e Task 24 (UI, via rota).

- [ ] **Step 1: Escrever os testes**

Usa um arquivo SQLite real em diretório temporário — sem mock do banco, só de `fetchMentions` (fronteira externa, sem Jira disponível em teste).

`tests/lib/notifications.test.ts`:
```ts
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

beforeEach(() => {
  vi.resetModules();
  const dbPath = path.join(mkdtempSync(path.join(tmpdir(), 'daily-web-db-')), 'test.db');
  process.env.DAILY_WEB_DB_PATH = dbPath;
});

describe('notifications_read', () => {
  it('marca uma notificação como lida e não a esquece', async () => {
    const { markRead, isRead } = await import('@/lib/notifications');
    expect(isRead('jira_mention', 'ENG-1')).toBe(false);
    markRead('jira_mention', 'ENG-1');
    expect(isRead('jira_mention', 'ENG-1')).toBe(true);
  });

  it('marcar duas vezes não falha (idempotente)', async () => {
    const { markRead, isRead } = await import('@/lib/notifications');
    markRead('jira_mention', 'ENG-1');
    markRead('jira_mention', 'ENG-1');
    expect(isRead('jira_mention', 'ENG-1')).toBe(true);
  });

  it('fontes diferentes com o mesmo id externo não se confundem', async () => {
    const { markRead, isRead } = await import('@/lib/notifications');
    markRead('jira_mention', 'X-1');
    expect(isRead('outra_fonte', 'X-1')).toBe(false);
  });
});

describe('getNotifications', () => {
  it('marca como lidas as issues já dispensadas antes', async () => {
    vi.doMock('@/lib/cli/jira', () => ({
      fetchMentions: vi.fn(async () => [
        {
          key: 'ENG-1', summary: 'Corrigir bug', status: '', project: 'ENG',
          url: 'https://x/ENG-1', parent: null, role: 'assignee' as const, kind: '', subtask: false,
        },
      ]),
    }));
    const { markRead, getNotifications } = await import('@/lib/notifications');
    markRead('jira_mention', 'ENG-1');
    const items = await getNotifications();
    expect(items).toHaveLength(1);
    expect(items[0].read).toBe(true);
    expect(items[0].title).toContain('ENG-1');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/notifications.test.ts`
Expected: FAIL — `lib/db.ts` não existe; `lib/notifications.ts` ainda é o stub sem `isRead`/`markRead`.

- [ ] **Step 3: Implementar `lib/db.ts`**

```ts
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

function resolveDbPath(): string {
  return process.env.DAILY_WEB_DB_PATH ?? path.join(process.cwd(), 'data', 'daily-web.db');
}

let db: Database.Database | null = null;
let dbPath: string | null = null;

export function getDb(): Database.Database {
  const currentPath = resolveDbPath();
  if (db && dbPath === currentPath) return db;

  fs.mkdirSync(path.dirname(currentPath), { recursive: true });
  db = new Database(currentPath);
  dbPath = currentPath;
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications_read (
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (source, external_id)
    );
  `);
  return db;
}
```

(Comparar `dbPath` reabre a conexão quando `DAILY_WEB_DB_PATH` muda entre testes com `vi.resetModules()`; em produção o valor nunca muda durante a vida do processo.)

- [ ] **Step 4: Substituir `lib/notifications.ts`**

```ts
import { getDb } from './db';
import { fetchMentions } from './cli/jira';
import type { NotificationItem } from '@/lib/types';

export function isRead(source: string, externalId: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM notifications_read WHERE source = ? AND external_id = ?')
    .get(source, externalId);
  return row !== undefined;
}

export function markRead(source: string, externalId: string): void {
  getDb()
    .prepare(
      'INSERT INTO notifications_read (source, external_id, read_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT (source, external_id) DO NOTHING',
    )
    .run(source, externalId, new Date().toISOString());
}

export async function getNotifications(): Promise<NotificationItem[]> {
  const mentions = await fetchMentions();
  return mentions.map((issue) => ({
    id: issue.key,
    source: 'jira_mention' as const,
    title: `${issue.key} — ${issue.summary}`,
    url: issue.url,
    read: isRead('jira_mention', issue.key),
  }));
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/notifications.test.ts`

- [ ] **Step 6: Implementar a rota de marcar como lida**

`app/api/notifications/[id]/read/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { markRead } from '@/lib/notifications';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  markRead('jira_mention', id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Rodar toda a suíte e o build**

Run: `npm run test && npm run build`
Expected: todos os testes (inclusive os das tasks anteriores) continuam passando.

- [ ] **Step 8: Commit**

```bash
git add lib/db.ts lib/notifications.ts app/api/notifications tests/lib/notifications.test.ts
git commit -m "feat: persist read notifications in SQLite"
```

---

### Task 15: Pomodoro (state machine + rotas + fallback ntfy)

**Files:**
- Modify: `lib/pomodoro.ts` (substitui o stub da Task 13)
- Create: `app/api/pomodoro/start/route.ts`, `app/api/pomodoro/pause/route.ts`, `app/api/pomodoro/reset/route.ts`, `app/api/pomodoro/notify-fallback/route.ts`
- Test: `tests/lib/pomodoro.test.ts`

**Interfaces:**
- Consumes: `PomodoroPhase`, `PomodoroState` (Task 1).
- Produces: `getPomodoroState(): PomodoroState` (mesma assinatura da Task 13, agora com state machine de verdade), `startPomodoro(): PomodoroState`, `pausePomodoro(): PomodoroState`, `resetPomodoro(): PomodoroState`, `onPhaseChange(listener: (phase: PomodoroPhase) => void): () => void` — usados pela Task 21 (`instrumentation.ts`, para o fallback ntfy) e Task 22 (UI).

- [ ] **Step 1: Escrever os testes**

`tests/lib/pomodoro.test.ts`:
```ts
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getPomodoroState, startPomodoro, pausePomodoro, resetPomodoro, onPhaseChange, resetStateForTests,
} from '@/lib/pomodoro';

beforeEach(() => {
  resetStateForTests();
  vi.useRealTimers();
});

describe('pomodoro', () => {
  it('começa parado na fase de foco com o tempo cheio', () => {
    const s = getPomodoroState();
    expect(s.phase).toBe('focus');
    expect(s.running).toBe(false);
    expect(s.remainingSeconds).toBe(25 * 60);
  });

  it('conta o tempo regressivamente enquanto rodando', () => {
    vi.setSystemTime(new Date('2026-08-25T10:00:00Z'));
    startPomodoro();
    vi.setSystemTime(new Date('2026-08-25T10:00:10Z'));
    expect(getPomodoroState().remainingSeconds).toBe(25 * 60 - 10);
  });

  it('pausar interrompe a contagem', () => {
    vi.setSystemTime(new Date('2026-08-25T10:00:00Z'));
    startPomodoro();
    vi.setSystemTime(new Date('2026-08-25T10:00:10Z'));
    pausePomodoro();
    vi.setSystemTime(new Date('2026-08-25T10:05:00Z'));
    const s = getPomodoroState();
    expect(s.remainingSeconds).toBe(25 * 60 - 10);
    expect(s.running).toBe(false);
  });

  it('ao terminar o foco, o descanso começa sozinho e soma um foco', () => {
    vi.setSystemTime(new Date('2026-08-25T10:00:00Z'));
    startPomodoro();
    vi.setSystemTime(new Date('2026-08-25T10:25:01Z'));
    const s = getPomodoroState();
    expect(s.phase).toBe('rest');
    expect(s.running).toBe(true);
    expect(s.completedFocusCount).toBe(1);
  });

  it('ao terminar o descanso, volta a foco e espera o próximo "iniciar"', () => {
    vi.setSystemTime(new Date('2026-08-25T10:00:00Z'));
    startPomodoro();
    vi.setSystemTime(new Date('2026-08-25T10:30:01Z'));
    const s = getPomodoroState();
    expect(s.phase).toBe('focus');
    expect(s.running).toBe(false);
  });

  it('reset zera a fase sem apagar o contador de focos', () => {
    vi.setSystemTime(new Date('2026-08-25T10:00:00Z'));
    startPomodoro();
    vi.setSystemTime(new Date('2026-08-25T10:25:01Z'));
    getPomodoroState();
    resetPomodoro();
    const s = getPomodoroState();
    expect(s.phase).toBe('focus');
    expect(s.remainingSeconds).toBe(25 * 60);
    expect(s.completedFocusCount).toBe(1);
  });

  it('notifica os listeners quando a fase vira', () => {
    const seen: string[] = [];
    const unsubscribe = onPhaseChange((phase) => seen.push(phase));
    vi.setSystemTime(new Date('2026-08-25T10:00:00Z'));
    startPomodoro();
    vi.setSystemTime(new Date('2026-08-25T10:25:01Z'));
    getPomodoroState();
    expect(seen).toEqual(['rest']);
    unsubscribe();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/pomodoro.test.ts`
Expected: FAIL — `startPomodoro`/`pausePomodoro`/`resetPomodoro`/`onPhaseChange`/`resetStateForTests` não existem no stub.

- [ ] **Step 3: Substituir `lib/pomodoro.ts`**

```ts
import type { PomodoroPhase, PomodoroState } from '@/lib/types';

const FOCUS_MINUTES = Number(process.env.POMODORO_FOCUS_MINUTES ?? '25');
const REST_MINUTES = Number(process.env.POMODORO_REST_MINUTES ?? '5');
const ENABLED = (process.env.POMODORO_ENABLED ?? 'true') !== 'false';

interface InternalState {
  phase: PomodoroPhase;
  running: boolean;
  remainingSeconds: number;
  completedFocusCount: number;
  lastTickAt: number;
}

function initialState(): InternalState {
  return {
    phase: 'focus',
    running: false,
    remainingSeconds: FOCUS_MINUTES * 60,
    completedFocusCount: 0,
    lastTickAt: Date.now(),
  };
}

let state: InternalState = initialState();

type PhaseChangeListener = (phase: PomodoroPhase) => void;
const listeners = new Set<PhaseChangeListener>();

export function onPhaseChange(listener: PhaseChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function phaseSeconds(phase: PomodoroPhase): number {
  return (phase === 'focus' ? FOCUS_MINUTES : REST_MINUTES) * 60;
}

function tick(): void {
  if (!state.running) {
    state.lastTickAt = Date.now();
    return;
  }
  const now = Date.now();
  const elapsed = Math.floor((now - state.lastTickAt) / 1000);
  if (elapsed <= 0) return;
  state.lastTickAt = now;
  state.remainingSeconds -= elapsed;

  while (state.remainingSeconds <= 0) {
    const finishedPhase = state.phase;
    if (finishedPhase === 'focus') state.completedFocusCount += 1;
    const nextPhase: PomodoroPhase = finishedPhase === 'focus' ? 'rest' : 'focus';
    state.remainingSeconds += phaseSeconds(nextPhase);
    state.phase = nextPhase;
    state.running = nextPhase === 'rest';
    for (const listener of listeners) listener(nextPhase);
  }
}

export function getPomodoroState(): PomodoroState {
  tick();
  return {
    enabled: ENABLED,
    phase: state.phase,
    running: state.running,
    remainingSeconds: Math.max(0, state.remainingSeconds),
    focusMinutes: FOCUS_MINUTES,
    restMinutes: REST_MINUTES,
    completedFocusCount: state.completedFocusCount,
  };
}

export function startPomodoro(): PomodoroState {
  tick();
  state.running = true;
  state.lastTickAt = Date.now();
  return getPomodoroState();
}

export function pausePomodoro(): PomodoroState {
  tick();
  state.running = false;
  return getPomodoroState();
}

export function resetPomodoro(): PomodoroState {
  state.phase = 'focus';
  state.running = false;
  state.remainingSeconds = phaseSeconds('focus');
  state.lastTickAt = Date.now();
  return getPomodoroState();
}

export function resetStateForTests(): void {
  state = initialState();
  listeners.clear();
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/pomodoro.test.ts`

- [ ] **Step 5: Implementar as rotas de API**

`app/api/pomodoro/start/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { startPomodoro } from '@/lib/pomodoro';

export async function POST() {
  return NextResponse.json(startPomodoro());
}
```

`app/api/pomodoro/pause/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { pausePomodoro } from '@/lib/pomodoro';

export async function POST() {
  return NextResponse.json(pausePomodoro());
}
```

`app/api/pomodoro/reset/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { resetPomodoro } from '@/lib/pomodoro';

export async function POST() {
  return NextResponse.json(resetPomodoro());
}
```

`app/api/pomodoro/notify-fallback/route.ts`:
```ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    return NextResponse.json({ sent: false });
  }
  const body = await request.json().catch(() => null);
  const message = body?.phase === 'rest' ? 'Hora de descansar' : 'Hora de focar';
  await fetch(`https://ntfy.sh/${topic}`, { method: 'POST', body: message }).catch(() => {});
  return NextResponse.json({ sent: true });
}
```

- [ ] **Step 6: Verificar que o build compila**

Run: `npm run build`

- [ ] **Step 7: Commit**

```bash
git add lib/pomodoro.ts app/api/pomodoro tests/lib/pomodoro.test.ts
git commit -m "feat: add pomodoro state machine, control routes and ntfy fallback"
```

---

### Task 16: Rotas de escrita de e-mail

**Files:**
- Create: `app/api/email/mark/route.ts`, `app/api/email/batch/route.ts`, `app/api/email/folders/route.ts`
- Create: `app/api/email/[account]/[id]/body/route.ts`, `app/api/email/[account]/[id]/gmail-url/route.ts`
- Test: `tests/api/email.test.ts`

**Interfaces:**
- Consumes: `setSeen`, `moveTo`, `deleteEmail`, `listFolders`, `fetchBody`, `gmailUrl` (Task 5, `lib/cli/himalaya.ts`).
- Produces: contrato HTTP consumido pela Task 22 (UI): `POST /api/email/mark {account,id,seen}`, `POST /api/email/batch {targets:[{account,id}], action, folder?}`, `GET /api/email/folders?account=`, `GET /api/email/[account]/[id]/body`, `GET /api/email/[account]/[id]/gmail-url`.

- [ ] **Step 1: Escrever os testes (mockando `lib/cli/himalaya`, já testado nas Tasks 5-6)**

`tests/api/email.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cli/himalaya', () => ({
  setSeen: vi.fn(),
  moveTo: vi.fn(),
  deleteEmail: vi.fn(),
  listFolders: vi.fn(),
  fetchBody: vi.fn(),
  gmailUrl: vi.fn(),
}));

import { setSeen, moveTo, deleteEmail, listFolders } from '@/lib/cli/himalaya';
import { POST as markRoute } from '@/app/api/email/mark/route';
import { POST as batchRoute } from '@/app/api/email/batch/route';
import { GET as foldersRoute } from '@/app/api/email/folders/route';

beforeEach(() => vi.clearAllMocks());

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/email/mark', () => {
  it('chama setSeen com os dados do corpo', async () => {
    await markRoute(jsonRequest({ account: 'work', id: '1', seen: true }));
    expect(setSeen).toHaveBeenCalledWith('work', '1', true);
  });
});

describe('POST /api/email/batch', () => {
  it('marca lido em lote', async () => {
    await batchRoute(jsonRequest({ targets: [{ account: 'work', id: '1' }, { account: 'personal', id: '2' }], action: 'read' }));
    expect(setSeen).toHaveBeenCalledWith('work', '1', true);
    expect(setSeen).toHaveBeenCalledWith('personal', '2', true);
  });

  it('exclui em lote', async () => {
    await batchRoute(jsonRequest({ targets: [{ account: 'work', id: '1' }], action: 'delete' }));
    expect(deleteEmail).toHaveBeenCalledWith('work', '1');
  });

  it('mover sem pasta devolve 400', async () => {
    const res = await batchRoute(jsonRequest({ targets: [{ account: 'work', id: '1' }], action: 'move' }));
    expect(res.status).toBe(400);
    expect(moveTo).not.toHaveBeenCalled();
  });

  it('mover com pasta chama moveTo', async () => {
    await batchRoute(jsonRequest({ targets: [{ account: 'work', id: '1' }], action: 'move', folder: 'Arquivo' }));
    expect(moveTo).toHaveBeenCalledWith('work', '1', 'Arquivo');
  });
});

describe('GET /api/email/folders', () => {
  it('conta inválida devolve 400', async () => {
    const res = await foldersRoute(new Request('http://localhost/api/email/folders?account=invalida'));
    expect(res.status).toBe(400);
    expect(listFolders).not.toHaveBeenCalled();
  });

  it('conta válida devolve as pastas', async () => {
    vi.mocked(listFolders).mockResolvedValue(['INBOX', 'Trash']);
    const res = await foldersRoute(new Request('http://localhost/api/email/folders?account=work'));
    const data = await res.json();
    expect(data.folders).toEqual(['INBOX', 'Trash']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/api/email.test.ts`

- [ ] **Step 3: Implementar as rotas**

`app/api/email/mark/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { setSeen } from '@/lib/cli/himalaya';
import type { Account } from '@/lib/types';

export async function POST(request: Request) {
  const body = await request.json();
  await setSeen(body.account as Account, body.id as string, body.seen as boolean);
  return NextResponse.json({ ok: true });
}
```

`app/api/email/batch/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { setSeen, moveTo, deleteEmail } from '@/lib/cli/himalaya';
import type { Account } from '@/lib/types';

interface Target {
  account: Account;
  id: string;
}

export async function POST(request: Request) {
  const body = await request.json();
  const targets: Target[] = body.targets ?? [];
  const action: 'read' | 'unread' | 'move' | 'delete' = body.action;
  const folder: string | undefined = body.folder;

  if (action === 'move' && !folder) {
    return NextResponse.json({ error: 'pasta obrigatória' }, { status: 400 });
  }

  for (const target of targets) {
    if (action === 'read') await setSeen(target.account, target.id, true);
    else if (action === 'unread') await setSeen(target.account, target.id, false);
    else if (action === 'delete') await deleteEmail(target.account, target.id);
    else if (action === 'move') await moveTo(target.account, target.id, folder as string);
  }
  return NextResponse.json({ ok: true });
}
```

`app/api/email/folders/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { listFolders } from '@/lib/cli/himalaya';
import type { Account } from '@/lib/types';

export async function GET(request: Request) {
  const account = new URL(request.url).searchParams.get('account');
  if (account !== 'work' && account !== 'personal') {
    return NextResponse.json({ error: 'conta inválida' }, { status: 400 });
  }
  const folders = await listFolders(account as Account);
  return NextResponse.json({ folders });
}
```

`app/api/email/[account]/[id]/body/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { fetchBody } from '@/lib/cli/himalaya';
import type { Account } from '@/lib/types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ account: Account; id: string }> },
) {
  const { account, id } = await params;
  try {
    const text = await fetchBody(account, id);
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
```

`app/api/email/[account]/[id]/gmail-url/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { gmailUrl } from '@/lib/cli/himalaya';
import type { Account } from '@/lib/types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ account: Account; id: string }> },
) {
  const { account, id } = await params;
  const url = await gmailUrl(account, id);
  return NextResponse.json({ url });
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/api/email.test.ts`

- [ ] **Step 5: Commit**

```bash
git add app/api/email tests/api/email.test.ts
git commit -m "feat: add email write API routes (mark, batch, folders, body, gmail link)"
```

---

### Task 17: Rotas de escrita de tarefas (CRUD + subtarefas)

**Files:**
- Create: `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`
- Create: `app/api/tasks/[id]/subtasks/route.ts`, `app/api/tasks/[id]/subtasks/[itemId]/route.ts`
- Test: `tests/api/tasks.test.ts`

**Interfaces:**
- Consumes: `addTask`, `editTask`, `completeTask`, `reopenTask`, `deleteTask`, `addSubtask`, `editSubtask`, `deleteSubtask`, `checkSubtask` (Task 10, `lib/cli/mstodo.ts`); `parseDueInput` (Task 11).
- Produces: contrato HTTP consumido pela Task 23 (UI): `POST /api/tasks {title, due?, priority?, recur?}`, `PATCH /api/tasks/[id] {completed?} | {title?, due?, priority?, recur?}`, `DELETE /api/tasks/[id]`, `POST /api/tasks/[id]/subtasks {title}`, `PATCH /api/tasks/[id]/subtasks/[itemId] {completed?, title?}`, `DELETE /api/tasks/[id]/subtasks/[itemId]`.

- [ ] **Step 1: Escrever os testes**

`tests/api/tasks.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cli/mstodo', () => ({
  addTask: vi.fn(async () => 'NEW-ID'),
  editTask: vi.fn(),
  completeTask: vi.fn(),
  reopenTask: vi.fn(),
  deleteTask: vi.fn(),
  addSubtask: vi.fn(),
  editSubtask: vi.fn(),
  deleteSubtask: vi.fn(),
  checkSubtask: vi.fn(),
}));

import { addTask, editTask, completeTask, reopenTask, deleteTask, checkSubtask } from '@/lib/cli/mstodo';
import { POST as createRoute } from '@/app/api/tasks/route';
import { PATCH as patchRoute, DELETE as deleteRoute } from '@/app/api/tasks/[id]/route';
import { PATCH as patchSubtaskRoute } from '@/app/api/tasks/[id]/subtasks/[itemId]/route';

beforeEach(() => vi.clearAllMocks());

function req(body: unknown): Request {
  return new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) });
}

const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

describe('POST /api/tasks', () => {
  it('título vazio devolve 400 sem chamar addTask', async () => {
    const res = await createRoute(req({ title: '  ' }));
    expect(res.status).toBe(400);
    expect(addTask).not.toHaveBeenCalled();
  });

  it('cria a tarefa e edita quando há campos extras', async () => {
    const res = await createRoute(req({ title: 'Nova tarefa', due: 'hoje', priority: 'high' }));
    const data = await res.json();
    expect(data.id).toBe('NEW-ID');
    expect(addTask).toHaveBeenCalledWith('Nova tarefa');
    expect(editTask).toHaveBeenCalledWith('NEW-ID', expect.objectContaining({ priority: 'high' }));
  });

  it('data inválida devolve 400', async () => {
    const res = await createRoute(req({ title: 'Nova tarefa', due: 'não é uma data' }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/tasks/[id]', () => {
  it('completed=true chama completeTask', async () => {
    await patchRoute(req({ completed: true }), params({ id: 'T1' }));
    expect(completeTask).toHaveBeenCalledWith('T1');
  });

  it('completed=false chama reopenTask', async () => {
    await patchRoute(req({ completed: false }), params({ id: 'T1' }));
    expect(reopenTask).toHaveBeenCalledWith('T1');
  });

  it('edição de campos chama editTask com a data já parseada', async () => {
    await patchRoute(req({ due: 'amanhã' }), params({ id: 'T1' }));
    expect(editTask).toHaveBeenCalledWith('T1', expect.objectContaining({ due: expect.any(String) }));
  });
});

describe('DELETE /api/tasks/[id]', () => {
  it('chama deleteTask', async () => {
    await deleteRoute(req({}), params({ id: 'T1' }));
    expect(deleteTask).toHaveBeenCalledWith('T1');
  });
});

describe('PATCH /api/tasks/[id]/subtasks/[itemId]', () => {
  it('completed marca a subtarefa', async () => {
    await patchSubtaskRoute(req({ completed: true }), params({ id: 'T1', itemId: 'S1' }));
    expect(checkSubtask).toHaveBeenCalledWith('T1', 'S1', true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/api/tasks.test.ts`

- [ ] **Step 3: Implementar as rotas**

`app/api/tasks/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { addTask, editTask } from '@/lib/cli/mstodo';
import { parseDueInput } from '@/lib/dateParsing';

export async function POST(request: Request) {
  const body = await request.json();
  const title: string = body.title ?? '';
  if (!title.trim()) {
    return NextResponse.json({ error: 'título obrigatório' }, { status: 400 });
  }

  const id = await addTask(title.trim());

  let due: string | undefined;
  let time: string | undefined;
  if (typeof body.due === 'string') {
    try {
      const parsed = parseDueInput(body.due);
      due = parsed.due;
      time = parsed.time;
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
    }
  }

  if (due !== undefined || body.priority !== undefined || body.recur !== undefined) {
    await editTask(id, { due, time, priority: body.priority, recur: body.recur });
  }
  return NextResponse.json({ id });
}
```

`app/api/tasks/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { editTask, completeTask, reopenTask, deleteTask } from '@/lib/cli/mstodo';
import { parseDueInput } from '@/lib/dateParsing';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  if (body.completed === true) {
    await completeTask(id);
    return NextResponse.json({ ok: true });
  }
  if (body.completed === false) {
    await reopenTask(id);
    return NextResponse.json({ ok: true });
  }

  let due: string | undefined;
  let time: string | undefined;
  if (typeof body.due === 'string') {
    try {
      const parsed = parseDueInput(body.due);
      due = parsed.due;
      time = parsed.time;
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
    }
  }

  await editTask(id, { title: body.title, due, time, recur: body.recur, priority: body.priority });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteTask(id);
  return NextResponse.json({ ok: true });
}
```

`app/api/tasks/[id]/subtasks/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { addSubtask } from '@/lib/cli/mstodo';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const title: string = body.title ?? '';
  if (!title.trim()) {
    return NextResponse.json({ error: 'título obrigatório' }, { status: 400 });
  }
  await addSubtask(id, title.trim());
  return NextResponse.json({ ok: true });
}
```

`app/api/tasks/[id]/subtasks/[itemId]/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { editSubtask, checkSubtask, deleteSubtask } from '@/lib/cli/mstodo';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const body = await request.json();
  if (typeof body.completed === 'boolean') {
    await checkSubtask(id, itemId, body.completed);
  }
  if (typeof body.title === 'string' && body.title.trim()) {
    await editSubtask(id, itemId, body.title.trim());
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  await deleteSubtask(id, itemId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/api/tasks.test.ts`

- [ ] **Step 5: Commit**

```bash
git add app/api/tasks tests/api/tasks.test.ts
git commit -m "feat: add task write API routes (CRUD, subtasks)"
```

---

### Task 18: Boot do servidor (refresher + fallback ntfy) e hook de polling do cliente

**Files:**
- Create: `instrumentation.ts`
- Create: `lib/hooks/usePolling.ts`
- Test: `tests/lib/hooks/usePolling.test.tsx`

**Interfaces:**
- Consumes: `startRefreshLoop` (Task 13); `onPhaseChange` (Task 15); `DashboardState` (Task 1).
- Produces: `useDashboardState(): { state: DashboardState | null; loading: boolean; refreshNow: () => Promise<void>; reload: () => Promise<void> }` — usado pela Task 19 (shell do dashboard) e por todos os painéis que recebem `onChanged`.

- [ ] **Step 1: Implementar `instrumentation.ts`**

Sem teste unitário: só é executado pelo runtime Node do Next no boot do processo; a lógica que ele chama (`startRefreshLoop`, `onPhaseChange`) já está coberta pelas Tasks 13 e 15.

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { startRefreshLoop } = await import('@/lib/refresher');
  const { onPhaseChange } = await import('@/lib/pomodoro');

  startRefreshLoop(Number(process.env.REFRESH_SECONDS ?? '300'));

  onPhaseChange((phase) => {
    const topic = process.env.NTFY_TOPIC;
    if (!topic) return;
    const message = phase === 'focus' ? 'Hora de focar' : 'Hora de descansar';
    fetch(`https://ntfy.sh/${topic}`, { method: 'POST', body: message }).catch(() => {});
  });
}
```

- [ ] **Step 2: Escrever o teste do hook de polling**

`tests/lib/hooks/usePolling.test.tsx`:
```tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { useDashboardState } from '@/lib/hooks/usePolling';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Probe() {
  const { state, loading, refreshNow } = useDashboardState();
  return (
    <div>
      <span data-testid="updated-at">{state?.updatedAt ?? 'carregando'}</span>
      <span data-testid="loading">{String(loading)}</span>
      <button onClick={() => void refreshNow()}>atualizar</button>
    </div>
  );
}

describe('useDashboardState', () => {
  it('carrega o estado ao montar', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ updatedAt: '2026-08-25T10:00:00.000Z' })),
    );
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('updated-at').textContent).toBe('2026-08-25T10:00:00.000Z'));
  });

  it('refreshNow chama POST /api/refresh e atualiza o estado', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ updatedAt: 'inicial' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ updatedAt: 'apos-refresh' })));
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('updated-at').textContent).toBe('inicial'));
    fireEvent.click(screen.getByText('atualizar'));
    await waitFor(() => expect(screen.getByTestId('updated-at').textContent).toBe('apos-refresh'));
    expect(fetchSpy).toHaveBeenCalledWith('/api/refresh', { method: 'POST' });
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/hooks/usePolling.test.tsx`

- [ ] **Step 4: Implementar `lib/hooks/usePolling.ts`**

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardState } from '@/lib/types';

const POLL_INTERVAL_MS = 20_000;

export function useDashboardState() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/state');
    if (!res.ok) return;
    const data: DashboardState = await res.json();
    if (mounted.current) setState(data);
  }, []);

  const refreshNow = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      if (res.ok) {
        const data: DashboardState = await res.json();
        if (mounted.current) setState(data);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, [load]);

  return { state, loading, refreshNow, reload: load };
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/hooks/usePolling.test.tsx`

- [ ] **Step 6: Commit**

```bash
git add instrumentation.ts lib/hooks/usePolling.ts tests/lib/hooks/usePolling.test.tsx
git commit -m "feat: boot background refresher on server start and add client polling hook"
```

---

### Task 19: Shell do dashboard, Clock e Pomodoro (UI)

**Files:**
- Modify: `app/page.tsx` (substitui o placeholder da Task 1)
- Create: `components/Clock.tsx`, `components/Pomodoro.tsx`
- Test: `tests/components/Clock.test.tsx`, `tests/components/Pomodoro.test.tsx`

**Interfaces:**
- Consumes: `useDashboardState` (Task 18); `PomodoroState` (Task 1); rotas `/api/pomodoro/*` (Task 15).
- Produces: `<Clock />`, `<Pomodoro pomodoro={PomodoroState | null} onChanged={() => void} />` — layout consumido pelas Tasks 20-24, que só precisam encaixar seus painéis dentro da grid já montada aqui.

- [ ] **Step 1: Escrever o teste de `Clock`**

`tests/components/Clock.test.tsx`:
```tsx
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Clock } from '@/components/Clock';

afterEach(cleanup);

describe('Clock', () => {
  it('renderiza a hora no formato HH:MM:SS', () => {
    render(<Clock />);
    const text = screen.getByTestId('clock').textContent ?? '';
    expect(text).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/components/Clock.test.tsx`

- [ ] **Step 3: Implementar `components/Clock.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';

const WEEKDAYS_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function formatDateLong(date: Date): string {
  return `${WEEKDAYS_PT[date.getDay()]}, ${date.getDate()} de ${MONTHS_PT[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour12: false });
}

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) return null;

  return (
    <div data-testid="clock">
      <div style={{ fontSize: '2rem' }}>{formatTime(now)}</div>
      <div style={{ color: 'var(--ctp-subtext0)' }}>{formatDateLong(now)}</div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/components/Clock.test.tsx`

- [ ] **Step 5: Escrever o teste de `Pomodoro`**

`tests/components/Pomodoro.test.tsx`:
```tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { Pomodoro } from '@/components/Pomodoro';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const base = {
  enabled: true, phase: 'focus' as const, running: false, remainingSeconds: 90,
  focusMinutes: 25, restMinutes: 5, completedFocusCount: 2,
};

describe('Pomodoro', () => {
  it('mostra a fase, o tempo restante e o contador de focos', () => {
    render(<Pomodoro pomodoro={base} onChanged={() => {}} />);
    const text = screen.getByTestId('pomodoro').textContent ?? '';
    expect(text).toContain('Foco');
    expect(text).toContain('01:30');
    expect(text).toContain('2 focos');
  });

  it('não renderiza nada quando o pomodoro está desligado', () => {
    render(<Pomodoro pomodoro={{ ...base, enabled: false }} onChanged={() => {}} />);
    expect(screen.queryByTestId('pomodoro')).toBeNull();
  });

  it('clicar em "iniciar" chama a API de start e avisa onChanged', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const onChanged = vi.fn();
    render(<Pomodoro pomodoro={base} onChanged={onChanged} />);
    fireEvent.click(screen.getByText('iniciar'));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/pomodoro/start', { method: 'POST' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('mostra "pausar" quando já está rodando', () => {
    render(<Pomodoro pomodoro={{ ...base, running: true }} onChanged={() => {}} />);
    expect(screen.getByText('pausar')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Rodar e confirmar falha**

Run: `npx vitest run tests/components/Pomodoro.test.tsx`

- [ ] **Step 7: Implementar `components/Pomodoro.tsx`**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import type { PomodoroPhase, PomodoroState } from '@/lib/types';

interface Props {
  pomodoro: PomodoroState | null;
  onChanged: () => void;
}

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function notifyPhaseChange(phase: PomodoroPhase): void {
  const message = phase === 'focus' ? 'Hora de focar' : 'Hora de descansar';
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    new Notification('daily-web', { body: message });
    return;
  }
  if (Notification.permission === 'default') {
    void Notification.requestPermission();
  }
  void fetch('/api/pomodoro/notify-fallback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase }),
  });
}

export function Pomodoro({ pomodoro, onChanged }: Props) {
  const lastPhase = useRef<PomodoroPhase | null>(null);

  useEffect(() => {
    if (!pomodoro) return;
    if (lastPhase.current !== null && lastPhase.current !== pomodoro.phase) {
      notifyPhaseChange(pomodoro.phase);
    }
    lastPhase.current = pomodoro.phase;
  }, [pomodoro?.phase]);

  if (!pomodoro || !pomodoro.enabled) return null;

  const toggle = async () => {
    await fetch(pomodoro.running ? '/api/pomodoro/pause' : '/api/pomodoro/start', { method: 'POST' });
    onChanged();
  };

  const reset = async () => {
    await fetch('/api/pomodoro/reset', { method: 'POST' });
    onChanged();
  };

  return (
    <div data-testid="pomodoro" className="card" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
      <span>{pomodoro.phase === 'focus' ? 'Foco' : 'Descanso'}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatRemaining(pomodoro.remainingSeconds)}</span>
      <span>{pomodoro.completedFocusCount} focos</span>
      <button onClick={() => void toggle()}>{pomodoro.running ? 'pausar' : 'iniciar'}</button>
      <button onClick={() => void reset()}>zerar</button>
    </div>
  );
}
```

- [ ] **Step 8: Rodar e confirmar sucesso**

Run: `npx vitest run tests/components/Pomodoro.test.tsx`

- [ ] **Step 9: Montar o shell do dashboard em `app/page.tsx`**

Painéis ainda não existem (Tasks 20-24 os criam) — este step já importa os componentes pelos nomes que essas tasks vão produzir, então `npm run build` só volta a compilar por completo depois da Task 24. Isso é esperado: o objetivo deste step é fixar o layout e o contrato de props antes de implementar cada painel.

```tsx
'use client';

import { useDashboardState } from '@/lib/hooks/usePolling';
import { Clock } from '@/components/Clock';
import { Pomodoro } from '@/components/Pomodoro';
import { EmailPanel } from '@/components/EmailPanel';
import { AgendaPanel } from '@/components/AgendaPanel';
import { PullsPanel } from '@/components/PullsPanel';
import { JiraPanel } from '@/components/JiraPanel';
import { TasksPanel } from '@/components/TasksPanel';
import { NotificationsBell } from '@/components/NotificationsBell';

export default function DashboardPage() {
  const { state, loading, refreshNow, reload } = useDashboardState();

  return (
    <main>
      <div className="topbar">
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <Clock />
          <Pomodoro pomodoro={state?.pomodoro ?? null} onChanged={reload} />
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button onClick={() => void refreshNow()} disabled={loading}>
            {loading ? 'atualizando…' : 'atualizar agora'}
          </button>
          <NotificationsBell
            notifications={state?.notifications ?? { data: [], error: null }}
            onChanged={reload}
          />
        </div>
      </div>
      <div className="dashboard-grid">
        <EmailPanel email={state?.email ?? { data: [], error: null }} onChanged={reload} />
        <AgendaPanel agenda={state?.agenda ?? { data: [], error: null }} />
        <JiraPanel jira={state?.jira ?? { data: [], error: null }} />
        <TasksPanel tasks={state?.tasks ?? { data: [], error: null }} onChanged={reload} />
        <PullsPanel pulls={state?.pulls ?? { data: { lines: [] }, error: null }} className="span-2" />
      </div>
    </main>
  );
}
```

- [ ] **Step 10: Commit**

```bash
git add app/page.tsx components/Clock.tsx components/Pomodoro.tsx tests/components/Clock.test.tsx tests/components/Pomodoro.test.tsx
git commit -m "feat: assemble dashboard shell with clock and pomodoro"
```

---

### Task 20: Painel de e-mail (lista, leitura sob demanda, ações em lote)

**Files:**
- Create: `components/EmailPanel.tsx`
- Test: `tests/components/EmailPanel.test.tsx`

**Interfaces:**
- Consumes: `EmailEnvelope`, `PanelResult`, `Account` (Task 1); rotas `/api/email/*` (Task 16).
- Produces: `<EmailPanel email={PanelResult<EmailEnvelope[]>} onChanged={() => void} />` — consumido por `app/page.tsx` (Task 19).

- [ ] **Step 1: Escrever os testes**

`tests/components/EmailPanel.test.tsx`:
```tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { EmailPanel } from '@/components/EmailPanel';
import type { EmailEnvelope } from '@/lib/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const messages: EmailEnvelope[] = [
  { id: '1', account: 'work', from: 'Alice', subject: 'Oi', unread: true, date: '' },
  { id: '2', account: 'personal', from: 'Bob', subject: 'Fatura', unread: false, date: '' },
];

describe('EmailPanel', () => {
  it('lista os e-mails com remetente e assunto', () => {
    render(<EmailPanel email={{ data: messages, error: null }} onChanged={() => {}} />);
    expect(screen.getByText(/Oi — Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Fatura — Bob/)).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<EmailPanel email={{ data: [], error: 'himalaya falhou: token expirado' }} onChanged={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('token expirado');
  });

  it('selecionar um e-mail habilita as ações em lote', () => {
    render(<EmailPanel email={{ data: messages, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByLabelText('selecionar Oi'));
    expect(screen.getByText('excluir')).toBeInTheDocument();
  });

  it('abrir um e-mail busca o corpo e marca como lido se estava não lido', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'corpo do e-mail' })))
      .mockResolvedValueOnce(new Response('{}'));
    const onChanged = vi.fn();
    render(<EmailPanel email={{ data: messages, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByText(/Oi — Alice/));
    await waitFor(() => expect(screen.getByText('corpo do e-mail')).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledWith('/api/email/work/1/body');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/components/EmailPanel.test.tsx`

- [ ] **Step 3: Implementar `components/EmailPanel.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { EmailEnvelope, PanelResult } from '@/lib/types';

interface Props {
  email: PanelResult<EmailEnvelope[]>;
  onChanged: () => void;
}

async function postJson(url: string, body: unknown) {
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function key(m: EmailEnvelope): string {
  return `${m.account}:${m.id}`;
}

export function EmailPanel({ email, onChanged }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openKey, setOpenKey] = useState<string | null>(null);

  const toggleSelect = (m: EmailEnvelope) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = key(m);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const runBatch = async (action: 'read' | 'unread' | 'delete') => {
    const targets = (email.data ?? [])
      .filter((m) => selected.has(key(m)))
      .map((m) => ({ account: m.account, id: m.id }));
    if (targets.length === 0) return;
    await postJson('/api/email/batch', { targets, action });
    setSelected(new Set());
    onChanged();
  };

  const openMessage = (m: EmailEnvelope) => {
    setOpenKey(key(m));
    if (m.unread) {
      void postJson('/api/email/mark', { account: m.account, id: m.id, seen: true }).then(onChanged);
    }
  };

  const openMessageData = (email.data ?? []).find((m) => key(m) === openKey) ?? null;

  return (
    <section className="card" data-testid="email-panel">
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>E-mail</h2>
        {selected.size > 0 && (
          <div>
            <button onClick={() => void runBatch('read')}>marcar lido</button>
            <button onClick={() => void runBatch('unread')}>marcar não lido</button>
            <button onClick={() => void runBatch('delete')}>excluir</button>
          </div>
        )}
      </header>
      {email.error && <p role="alert">{email.error}</p>}
      <ul>
        {(email.data ?? []).map((m) => (
          <li key={key(m)} style={{ fontWeight: m.unread ? 700 : 400 }}>
            <input
              type="checkbox"
              checked={selected.has(key(m))}
              onChange={() => toggleSelect(m)}
              aria-label={`selecionar ${m.subject}`}
            />
            <span>[{m.account === 'work' ? 'W' : 'P'}]</span>
            <button onClick={() => openMessage(m)}>
              {m.subject || '(sem assunto)'} — {m.from}
            </button>
          </li>
        ))}
      </ul>
      {openMessageData && (
        <EmailDetail email={openMessageData} onClose={() => setOpenKey(null)} onChanged={onChanged} />
      )}
    </section>
  );
}

function EmailDetail({
  email,
  onClose,
  onChanged,
}: {
  email: EmailEnvelope;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [body, setBody] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/email/${email.account}/${email.id}/body`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setBody(data.text ?? data.error ?? '');
      });
    return () => {
      cancelled = true;
    };
  }, [email.account, email.id]);

  const remove = async () => {
    await postJson('/api/email/batch', { targets: [{ account: email.account, id: email.id }], action: 'delete' });
    onChanged();
    onClose();
  };

  return (
    <div role="dialog" aria-label="corpo do e-mail" className="card">
      <button onClick={onClose}>fechar</button>
      <h3>{email.subject}</h3>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{body ?? 'carregando…'}</pre>
      <button onClick={() => void remove()}>excluir</button>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/components/EmailPanel.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add components/EmailPanel.tsx tests/components/EmailPanel.test.tsx
git commit -m "feat: add email panel with on-demand body and batch actions"
```

---

### Task 21: Painéis de agenda e PRs/issues (somente leitura)

**Files:**
- Create: `components/AgendaPanel.tsx`, `components/PullsPanel.tsx`
- Test: `tests/components/AgendaPanel.test.tsx`, `tests/components/PullsPanel.test.tsx`

**Interfaces:**
- Consumes: `AgendaItem`, `PullsDigest`, `PanelResult` (Task 1).
- Produces: `<AgendaPanel agenda={PanelResult<AgendaItem[]>} />`, `<PullsPanel pulls={PanelResult<PullsDigest>} className?={string} />` — consumidos por `app/page.tsx` (Task 19).

- [ ] **Step 1: Escrever o teste de `AgendaPanel`**

`tests/components/AgendaPanel.test.tsx`:
```tsx
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AgendaPanel } from '@/components/AgendaPanel';

afterEach(cleanup);

describe('AgendaPanel', () => {
  it('agrupa os eventos por data e mostra "dia inteiro" quando não há hora', () => {
    render(
      <AgendaPanel
        agenda={{
          data: [
            { account: 'work', date: '2026-08-26', time: '14:00', title: 'Daily' },
            { account: 'personal', date: '2026-08-26', time: '', title: 'Feriado' },
          ],
          error: null,
        }}
      />,
    );
    expect(screen.getByText(/Daily/)).toBeInTheDocument();
    expect(screen.getByText(/dia inteiro — Feriado/)).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<AgendaPanel agenda={{ data: [], error: 'gcalcli falhou: token expirado' }} />);
    expect(screen.getByRole('alert').textContent).toContain('token expirado');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/components/AgendaPanel.test.tsx`

- [ ] **Step 3: Implementar `components/AgendaPanel.tsx`**

```tsx
import type { AgendaItem, PanelResult } from '@/lib/types';

function groupByDate(items: AgendaItem[]): Map<string, AgendaItem[]> {
  const sorted = [...items].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
  const map = new Map<string, AgendaItem[]>();
  for (const item of sorted) {
    const list = map.get(item.date) ?? [];
    list.push(item);
    map.set(item.date, list);
  }
  return map;
}

export function AgendaPanel({ agenda }: { agenda: PanelResult<AgendaItem[]> }) {
  const groups = groupByDate(agenda.data ?? []);
  return (
    <section className="card" data-testid="agenda-panel">
      <h2>Agenda</h2>
      {agenda.error && <p role="alert">{agenda.error}</p>}
      {[...groups.entries()].map(([date, items]) => (
        <div key={date}>
          <strong>{date}</strong>
          <ul>
            {items.map((item, i) => (
              <li key={i}>
                <span>[{item.account === 'work' ? 'W' : 'P'}]</span>{' '}
                {item.time || 'dia inteiro'} — {item.title}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/components/AgendaPanel.test.tsx`

- [ ] **Step 5: Escrever o teste de `PullsPanel`**

`tests/components/PullsPanel.test.tsx`:
```tsx
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PullsPanel } from '@/components/PullsPanel';

afterEach(cleanup);

describe('PullsPanel', () => {
  it('renderiza cada linha do digest e transforma URLs em links', () => {
    render(
      <PullsPanel
        pulls={{
          data: { lines: ['daily-web', 'PR #3 https://github.com/joaosouzacoder/daily-web/pull/3'] },
          error: null,
        }}
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://github.com/joaosouzacoder/daily-web/pull/3');
  });

  it('mostra o erro do painel quando presente', () => {
    render(<PullsPanel pulls={{ data: { lines: [] }, error: 'ghpending falhou: sem token' }} />);
    expect(screen.getByRole('alert').textContent).toContain('sem token');
  });
});
```

- [ ] **Step 6: Rodar e confirmar falha**

Run: `npx vitest run tests/components/PullsPanel.test.tsx`

- [ ] **Step 7: Implementar `components/PullsPanel.tsx`**

```tsx
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

export function PullsPanel({ pulls, className }: { pulls: PanelResult<PullsDigest>; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`} data-testid="pulls-panel">
      <h2>PRs/Issues</h2>
      {pulls.error && <p role="alert">{pulls.error}</p>}
      <div>{(pulls.data?.lines ?? []).map((line, i) => renderLine(line, i))}</div>
    </section>
  );
}
```

- [ ] **Step 8: Rodar e confirmar sucesso**

Run: `npx vitest run tests/components/PullsPanel.test.tsx`

- [ ] **Step 9: Commit**

```bash
git add components/AgendaPanel.tsx components/PullsPanel.tsx tests/components/AgendaPanel.test.tsx tests/components/PullsPanel.test.tsx
git commit -m "feat: add read-only agenda and pull-request digest panels"
```

---

### Task 22: Painel do Jira (filtro, agrupar por pai, marcador de papel)

**Files:**
- Create: `components/JiraPanel.tsx`
- Test: `tests/components/JiraPanel.test.tsx`

**Interfaces:**
- Consumes: `JiraItem`, `PanelResult` (Task 1); `groupByParent`, `issueMarker` (Task 8, `lib/parsers/jira.ts` — módulo puro, seguro para importar num client component).
- Produces: `<JiraPanel jira={PanelResult<JiraItem[]>} />` — consumido por `app/page.tsx` (Task 19).

- [ ] **Step 1: Escrever os testes**

Regra do README a replicar: no filtro "ambas", `REL` (verde) aparece só quando o papel é exclusivamente `reporter`; `RES` (laranja) aparece quando é `assignee` ou `both` ("sua para fazer, inclusive quando também é relator"); nos outros filtros o marcador some porque todas as issues têm o mesmo papel. Ordem do ciclo: `ambas → minhas → relator`.

`tests/components/JiraPanel.test.tsx`:
```tsx
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { JiraPanel } from '@/components/JiraPanel';
import type { JiraItem } from '@/lib/types';

afterEach(cleanup);

const issues: JiraItem[] = [
  { key: 'A-1', summary: 'Bug', status: '', project: 'A', url: 'https://x/A-1', parent: null, role: 'reporter', kind: 'Bug', subtask: false },
  { key: 'A-2', summary: 'Feature', status: '', project: 'A', url: 'https://x/A-2', parent: null, role: 'both', kind: 'História', subtask: false },
];

describe('JiraPanel', () => {
  it('mostra REL para quem só relatou e RES para quem é responsável, no filtro ambas', () => {
    render(<JiraPanel jira={{ data: issues, error: null }} />);
    expect(screen.getByText('REL')).toBeInTheDocument();
    expect(screen.getByText('RES')).toBeInTheDocument();
  });

  it('ciclar o filtro (ambas -> minhas) esconde o marcador de papel', () => {
    render(<JiraPanel jira={{ data: issues, error: null }} />);
    fireEvent.click(screen.getByText(/filtro: ambas/));
    expect(screen.getByText(/filtro: minhas/)).toBeInTheDocument();
    expect(screen.queryByText('REL')).toBeNull();
  });

  it('agrupar por pai mostra o resumo do pai como cabeçalho', () => {
    const withParent: JiraItem[] = [
      { key: 'B-1', summary: 'Filha', status: '', project: 'B', url: 'https://x/B-1', parent: { key: 'B-0', summary: 'Épico mãe' }, role: 'assignee', kind: 'História', subtask: false },
    ];
    render(<JiraPanel jira={{ data: withParent, error: null }} />);
    fireEvent.click(screen.getByText('agrupar por pai'));
    expect(screen.getByText('Épico mãe')).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<JiraPanel jira={{ data: [], error: 'jira falhou: JIRA_TOKEN ausente' }} />);
    expect(screen.getByRole('alert').textContent).toContain('JIRA_TOKEN');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/components/JiraPanel.test.tsx`

- [ ] **Step 3: Implementar `components/JiraPanel.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import type { JiraItem, PanelResult } from '@/lib/types';
import { groupByParent, issueMarker } from '@/lib/parsers/jira';

type Filter = 'both' | 'assignee' | 'reporter';
const FILTER_CYCLE: Filter[] = ['both', 'assignee', 'reporter'];
const FILTER_LABEL: Record<Filter, string> = { both: 'ambas', assignee: 'minhas', reporter: 'relator' };

function roleBadge(role: JiraItem['role']): { label: string; color: string } {
  if (role === 'reporter') return { label: 'REL', color: 'var(--ctp-green)' };
  return { label: 'RES', color: '#FF991F' };
}

export function JiraPanel({ jira }: { jira: PanelResult<JiraItem[]> }) {
  const [filter, setFilter] = useState<Filter>('both');
  const [grouped, setGrouped] = useState(false);

  const filtered = (jira.data ?? []).filter((i) => filter === 'both' || i.role === filter);
  const groups = useMemo(() => groupByParent(filtered), [filtered]);

  const cycleFilter = () =>
    setFilter((f) => FILTER_CYCLE[(FILTER_CYCLE.indexOf(f) + 1) % FILTER_CYCLE.length]);

  return (
    <section className="card" data-testid="jira-panel">
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>Jira</h2>
        <div>
          <button onClick={cycleFilter}>filtro: {FILTER_LABEL[filter]}</button>
          <button onClick={() => setGrouped((g) => !g)}>{grouped ? 'lista' : 'agrupar por pai'}</button>
        </div>
      </header>
      {jira.error && <p role="alert">{jira.error}</p>}
      {!grouped && (
        <ul>
          {filtered.map((issue) => (
            <JiraRow key={issue.key} issue={issue} showRole={filter === 'both'} />
          ))}
        </ul>
      )}
      {grouped &&
        groups.map((group) => (
          <div key={group.parentKey ?? 'sem-pai'}>
            <strong>{group.parentSummary}</strong>
            <ul>
              {group.issues.map((issue) => (
                <JiraRow key={issue.key} issue={issue} showRole={filter === 'both'} />
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}

function JiraRow({ issue, showRole }: { issue: JiraItem; showRole: boolean }) {
  const badge = showRole ? roleBadge(issue.role) : null;
  return (
    <li>
      {badge && <span style={{ color: badge.color }}>{badge.label}</span>}{' '}
      <span>{issueMarker(issue)}</span>{' '}
      <a href={issue.url} target="_blank" rel="noreferrer">
        {issue.key}
      </a>{' '}
      — {issue.summary}
    </li>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/components/JiraPanel.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add components/JiraPanel.tsx tests/components/JiraPanel.test.tsx
git commit -m "feat: add Jira panel with role badges, filter cycling and parent grouping"
```

---

### Task 23: Painel de tarefas + formulário (criar/editar/concluir/apagar)

**Files:**
- Create: `components/TasksPanel.tsx`, `components/TaskFormModal.tsx`
- Test: `tests/components/TasksPanel.test.tsx`, `tests/components/TaskFormModal.test.tsx`

**Interfaces:**
- Consumes: `TodoTask`, `TaskPriority`, `PanelResult` (Task 1); `groupTasksByDueWindow` (Task 12, puro); rotas `/api/tasks*` (Task 17).
- Produces: `<TasksPanel tasks={PanelResult<TodoTask[]>} onChanged={() => void} />` — consumido por `app/page.tsx` (Task 19).

- [ ] **Step 1: Escrever o teste de `TasksPanel`**

`tests/components/TasksPanel.test.tsx`:
```tsx
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TasksPanel } from '@/components/TasksPanel';
import type { TodoTask } from '@/lib/types';

afterEach(cleanup);

const tasks: TodoTask[] = [
  { id: 'a', title: 'Comprar café', completed: false, due: '2026-08-25', priority: 'high', time: '', recur: '', notes: '', subtasks: [] },
];

describe('TasksPanel', () => {
  it('agrupa por faixa de prazo e mostra o marcador de prioridade', () => {
    render(<TasksPanel tasks={{ data: tasks, error: null }} onChanged={() => {}} />);
    expect(screen.getByText('HOJE')).toBeInTheDocument();
    expect(screen.getByText('!!!')).toBeInTheDocument();
  });

  it('abre o formulário ao clicar em uma tarefa', () => {
    render(<TasksPanel tasks={{ data: tasks, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByText('Comprar café'));
    expect(screen.getByRole('dialog', { name: 'formulário de tarefa' })).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<TasksPanel tasks={{ data: [], error: 'mstodo falhou: sem credenciais' }} onChanged={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('sem credenciais');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/components/TasksPanel.test.tsx`

- [ ] **Step 3: Escrever o teste de `TaskFormModal`**

`tests/components/TaskFormModal.test.tsx`:
```tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TaskFormModal } from '@/components/TaskFormModal';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TaskFormModal', () => {
  it('não salva sem título', () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(<TaskFormModal task={null} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByText('salvar'));
    expect(screen.getByRole('alert').textContent).toContain('título obrigatório');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cria uma tarefa nova ao salvar com título preenchido', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const onSaved = vi.fn();
    render(<TaskFormModal task={null} onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'Nova tarefa' } });
    fireEvent.click(screen.getByText('salvar'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({ method: 'POST' }));
  });

  it('mostra o erro devolvido pela API sem fechar o formulário', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'data inválida: 32/13' }), { status: 400 }),
    );
    const onSaved = vi.fn();
    render(
      <TaskFormModal
        task={{ id: 'T1', title: 'Tarefa', completed: false, due: '', priority: 'normal', time: '', recur: '', notes: '', subtasks: [] }}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByText('salvar'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('data inválida'));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('ciclar a prioridade avança normal -> alta -> baixa -> normal', () => {
    render(<TaskFormModal task={null} onClose={() => {}} onSaved={() => {}} />);
    const button = screen.getByText(/prioridade: normal/);
    fireEvent.click(button);
    expect(screen.getByText(/prioridade: high/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/prioridade: high/));
    expect(screen.getByText(/prioridade: low/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Rodar e confirmar falha**

Run: `npx vitest run tests/components/TaskFormModal.test.tsx`

- [ ] **Step 5: Implementar `components/TaskFormModal.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { TaskPriority, TodoTask } from '@/lib/types';

interface Props {
  task: TodoTask | null;
  onClose: () => void;
  onSaved: () => void;
}

const RECUR_CYCLE = ['none', 'daily', 'weekly', 'monthly'] as const;
const PRIORITY_CYCLE: TaskPriority[] = ['normal', 'high', 'low'];

function initialRecur(task: TodoTask | null): (typeof RECUR_CYCLE)[number] {
  if (task?.recur === 'daily' || task?.recur === 'weekly') return task.recur;
  if (task?.recur === 'absoluteMonthly') return 'monthly';
  return 'none';
}

export function TaskFormModal({ task, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [due, setDue] = useState(task?.due ? `${task.due}${task.time ? ` ${task.time}` : ''}` : '');
  const [recur, setRecur] = useState<(typeof RECUR_CYCLE)[number]>(initialRecur(task));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal');
  const [error, setError] = useState<string | null>(null);

  const cycle = <T,>(list: readonly T[], current: T): T => list[(list.indexOf(current) + 1) % list.length];

  const save = async () => {
    if (!title.trim()) {
      setError('título obrigatório');
      return;
    }
    setError(null);
    try {
      const res = task
        ? await fetch(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, due, priority, recur }),
          })
        : await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, due, priority, recur: recur === 'none' ? undefined : recur }),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'falha ao salvar');
        return;
      }
      onSaved();
    } catch {
      setError('falha ao salvar');
    }
  };

  return (
    <div role="dialog" aria-label="formulário de tarefa" className="card">
      <label>
        Título
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Vencimento (hoje, amanhã, +3d, AAAA-MM-DD, com hora opcional)
        <input value={due} onChange={(e) => setDue(e.target.value)} placeholder="hoje 14:30" />
      </label>
      <button type="button" onClick={() => setPriority(cycle(PRIORITY_CYCLE, priority))}>
        prioridade: {priority}
      </button>
      <button type="button" onClick={() => setRecur(cycle(RECUR_CYCLE, recur))}>
        repetição: {recur}
      </button>
      {error && <p role="alert">{error}</p>}
      <button onClick={() => void save()}>salvar</button>
      <button onClick={onClose}>cancelar</button>
    </div>
  );
}
```

- [ ] **Step 6: Rodar e confirmar sucesso**

Run: `npx vitest run tests/components/TaskFormModal.test.tsx`

- [ ] **Step 7: Implementar `components/TasksPanel.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { PanelResult, TodoTask } from '@/lib/types';
import { groupTasksByDueWindow } from '@/lib/taskGrouping';
import { TaskFormModal } from './TaskFormModal';

async function sendJson(url: string, body: unknown, method: string) {
  await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export function TasksPanel({ tasks, onChanged }: { tasks: PanelResult<TodoTask[]>; onChanged: () => void }) {
  const [editing, setEditing] = useState<TodoTask | 'new' | null>(null);
  const groups = groupTasksByDueWindow(tasks.data ?? []);

  const toggleComplete = async (task: TodoTask) => {
    await sendJson(`/api/tasks/${task.id}`, { completed: !task.completed }, 'PATCH');
    onChanged();
  };

  const remove = async (task: TodoTask) => {
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    onChanged();
  };

  return (
    <section className="card" data-testid="tasks-panel">
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>Tarefas</h2>
        <button onClick={() => setEditing('new')}>nova tarefa</button>
      </header>
      {tasks.error && <p role="alert">{tasks.error}</p>}
      {groups.map((group) => (
        <div key={group.key}>
          <strong>{group.label}</strong>
          <ul>
            {group.tasks.map((task) => (
              <li key={task.id} style={{ textDecoration: task.completed ? 'line-through' : 'none' }}>
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => void toggleComplete(task)}
                  aria-label={`concluir ${task.title}`}
                />
                {task.priority === 'high' && <span>!!!</span>}
                {task.priority === 'normal' && <span>!</span>}
                {task.recur !== '' && <span>↻</span>}
                <button onClick={() => setEditing(task)}>{task.title}</button>
                {task.due && <span> — {task.due}</span>}
                <button onClick={() => void remove(task)}>apagar</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {editing && (
        <TaskFormModal
          task={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 8: Rodar e confirmar sucesso**

Run: `npx vitest run tests/components/TasksPanel.test.tsx`

- [ ] **Step 9: Commit**

```bash
git add components/TasksPanel.tsx components/TaskFormModal.tsx tests/components/TasksPanel.test.tsx tests/components/TaskFormModal.test.tsx
git commit -m "feat: add tasks panel with due-window grouping and create/edit form"
```

---

### Task 24: Sino de notificações

**Files:**
- Create: `components/NotificationsBell.tsx`
- Test: `tests/components/NotificationsBell.test.tsx`

**Interfaces:**
- Consumes: `NotificationItem`, `PanelResult` (Task 1); rota `/api/notifications/[id]/read` (Task 14).
- Produces: `<NotificationsBell notifications={PanelResult<NotificationItem[]>} onChanged={() => void} />` — consumido por `app/page.tsx` (Task 19). Com esta task, `app/page.tsx` volta a compilar por completo (último painel pendente desde a Task 19).

- [ ] **Step 1: Escrever os testes**

`tests/components/NotificationsBell.test.tsx`:
```tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { NotificationsBell } from '@/components/NotificationsBell';
import type { NotificationItem } from '@/lib/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const items: NotificationItem[] = [
  { id: 'A-1', source: 'jira_mention', title: 'A-1 — Bug', url: 'https://x/A-1', read: false },
];

describe('NotificationsBell', () => {
  it('mostra a contagem de não lidas no sino', () => {
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={() => {}} />);
    expect(screen.getByLabelText('notificações').textContent).toContain('1');
  });

  it('não mostra contagem quando tudo está lido', () => {
    render(
      <NotificationsBell
        notifications={{ data: [{ ...items[0], read: true }], error: null }}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByLabelText('notificações').textContent?.trim()).toBe('🔔');
  });

  it('abre o painel e lista as notificações', () => {
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByLabelText('notificações'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/A-1 — Bug/)).toBeInTheDocument();
  });

  it('marcar como lida chama a API e avisa onChanged', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const onChanged = vi.fn();
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText('notificações'));
    fireEvent.click(screen.getByText('marcar como lida'));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/notifications/A-1/read', { method: 'POST' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/components/NotificationsBell.test.tsx`

- [ ] **Step 3: Implementar `components/NotificationsBell.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { NotificationItem, PanelResult } from '@/lib/types';

export function NotificationsBell({
  notifications,
  onChanged,
}: {
  notifications: PanelResult<NotificationItem[]>;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const items = notifications.data ?? [];
  const unreadCount = items.filter((n) => !n.read).length;

  const markRead = async (item: NotificationItem) => {
    await fetch(`/api/notifications/${item.id}/read`, { method: 'POST' });
    onChanged();
  };

  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} aria-label="notificações">
        🔔{unreadCount > 0 && <span> {unreadCount}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="central de notificações" className="card">
          {notifications.error && <p role="alert">{notifications.error}</p>}
          <ul>
            {items.map((item) => (
              <li key={item.id} style={{ opacity: item.read ? 0.6 : 1 }}>
                <span>[JIRA]</span>{' '}
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.title}
                </a>
                {!item.read && <button onClick={() => void markRead(item)}>marcar como lida</button>}
              </li>
            ))}
            {items.length === 0 && <li>nada por aqui</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/components/NotificationsBell.test.tsx`

- [ ] **Step 5: Rodar a suíte inteira e o build**

Run: `npm run test && npm run build`
Expected: todos os testes passam; o build compila por completo agora que todos os painéis importados em `app/page.tsx` (Task 19) existem.

- [ ] **Step 6: Commit**

```bash
git add components/NotificationsBell.tsx tests/components/NotificationsBell.test.tsx
git commit -m "feat: add notifications bell with unread count and mark-as-read"
```

---

### Task 25: Artefatos de deploy (systemd, Traefik, script, README)

Esta task só entrega arquivos — **não** executa `systemctl`, não edita `/docker/traefik/dynamic.yml` de verdade e não mexe em DNS. Mexer em infra compartilhada (Traefik serve outros apps desta VPS) pede confirmação explícita do usuário antes de qualquer execução real; os comandos ficam documentados no README para ele rodar.

**Files:**
- Create: `.env.example`
- Create: `deploy/daily-web.service`, `deploy/traefik-router-snippet.yml`, `deploy/traefik-service-snippet.yml`
- Create: `scripts/deploy.sh`
- Create/Modify: `README.md`

**Interfaces:**
- Consumes: nenhuma (task de infraestrutura, sem código de app).
- Produces: nenhuma interface de código — produz os artefatos operacionais que fecham a spec (`docs/superpowers/specs/2026-08-25-daily-web-design.md`, seção "Deploy nesta VPS").

- [ ] **Step 1: Criar `.env.example`**

```
# Autenticação
DASHBOARD_USER=
DASHBOARD_PASSWORD_HASH=
SESSION_SECRET=

# Contas de e-mail/agenda (himalaya usa os ids "work"/"personal" configurados nele)
WORK_CALENDAR_EMAIL=
PERSONAL_CALENDAR_EMAIL=

# Jira
JIRA_CLOUD=
JIRA_EMAIL=
JIRA_TOKEN=

# GitHub (ghpending)
GITHUB_TOKEN=

# Microsoft To Do
DAILY_TUI_TODO_CLIENT_ID=14d82eec-204b-4c2f-b7e8-296a70dab67e
DAILY_TUI_TODO_LIST=

# Pomodoro
POMODORO_ENABLED=true
POMODORO_FOCUS_MINUTES=25
POMODORO_REST_MINUTES=5
NTFY_TOPIC=

# Atualização em segundo plano
REFRESH_SECONDS=300

# Banco local (SQLite)
DAILY_WEB_DB_PATH=/home/jgabr/projects/daily-web/data/daily-web.db
```

- [ ] **Step 2: Criar `deploy/daily-web.service`**

```ini
[Unit]
Description=daily-web dashboard
After=network.target

[Service]
Type=simple
User=jgabr
WorkingDirectory=/home/jgabr/projects/daily-web
EnvironmentFile=/etc/daily-web/env
ExecStart=/usr/bin/env npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 3: Criar os fragmentos de Traefik**

Fragmentos para o usuário mesclar manualmente em `/docker/traefik/dynamic.yml` — sob a chave `http.routers` e `http.services` já existentes (o mesmo arquivo que já roteia o `pergunteai`), nunca duplicando a chave `http:` de topo.

`deploy/traefik-router-snippet.yml` (adicionar dentro de `http.routers`):
```yaml
    daily-web-app:
      rule: "Host(`dashboard.joaosouzacoder.com.br`)"
      priority: 200
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
      service: daily-web-app
```

`deploy/traefik-service-snippet.yml` (adicionar dentro de `http.services`):
```yaml
    daily-web-app:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:8010"
```

- [ ] **Step 4: Criar `scripts/deploy.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
git pull --ff-only
npm ci
npm run build
sudo systemctl restart daily-web
sudo systemctl status daily-web --no-pager
```

Run: `chmod +x scripts/deploy.sh`

- [ ] **Step 5: Escrever `README.md`**

```markdown
# daily-web

Dashboard pessoal (Catppuccin Mocha) com paridade de features com o
[daily-tui](https://github.com/joaosouzacoder/daily-tui): e-mail, agenda, PRs,
Jira, tarefas e pomodoro, atrás de login/senha, pensado para ficar aberto num
segundo monitor. Roda em `dashboard.joaosouzacoder.com.br`.

Arquitetura completa em
[`docs/superpowers/specs/2026-08-25-daily-web-design.md`](docs/superpowers/specs/2026-08-25-daily-web-design.md).

## Desenvolvimento

\`\`\`sh
npm install
npm run dev      # http://localhost:8010
npm test         # roda a suíte inteira uma vez
npm run test:watch
\`\`\`

Copie `.env.example` para `.env.local` e preencha o que for testar localmente.

## Deploy nesta VPS (primeira vez)

1. **Gerar o hash da senha** (usa o bcryptjs já instalado como dependência):

   \`\`\`sh
   node -e "require('bcryptjs').hash(process.argv[1], 10).then(console.log)" 'sua-senha-aqui'
   \`\`\`

2. **Criar `/etc/daily-web/env`** (fora do git) com base em `.env.example`,
   preenchendo `DASHBOARD_USER`, o hash gerado acima em
   `DASHBOARD_PASSWORD_HASH`, e um `SESSION_SECRET` aleatório
   (`openssl rand -hex 32`):

   \`\`\`sh
   sudo mkdir -p /etc/daily-web
   sudo cp .env.example /etc/daily-web/env
   sudo chmod 600 /etc/daily-web/env
   sudo nano /etc/daily-web/env
   \`\`\`

3. **Instalar o serviço systemd:**

   \`\`\`sh
   sudo cp deploy/daily-web.service /etc/systemd/system/daily-web.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now daily-web
   \`\`\`

4. **Mesclar o Traefik**: adicionar o conteúdo de
   `deploy/traefik-router-snippet.yml` dentro de `http.routers` e de
   `deploy/traefik-service-snippet.yml` dentro de `http.services` em
   `/docker/traefik/dynamic.yml` (o Traefik já observa esse arquivo — não
   precisa reiniciar o container).

5. **Cloudflare**: criar o registro `A` (ou `CNAME`) de `dashboard` apontando
   para o IP desta VPS, no mesmo modo (proxied) usado pelos outros
   subdomínios.

6. **Conferir**: `curl -I https://dashboard.joaosouzacoder.com.br` deve
   redirecionar para `/login`.

## Deploys seguintes

\`\`\`sh
./scripts/deploy.sh
\`\`\`

## Autenticação das CLIs de dados

`himalaya`, `gcalcli`, `jira`, `mstodo` e `ghpending` precisam estar
instaladas e autenticadas **nesta VPS** (contas próprias, separadas do
notebook) antes que os painéis correspondentes mostrem dados — enquanto isso,
o painel mostra o erro da CLI no lugar dos dados, sem derrubar o resto do
dashboard. Ver a seção "Autenticação headless das CLIs" da spec para o
raciocínio; o passo a passo de cada CLI é o mesmo do
[README do daily-tui](https://github.com/joaosouzacoder/daily-tui#configuração-das-contas),
adaptado para rodar sem navegador local quando aplicável.
```

- [ ] **Step 6: Verificar a suíte completa, o build e commitar**

Run: `npm run test && npm run build`
Expected: toda a suíte passa, build sem erro.

```bash
git add .env.example deploy/ scripts/deploy.sh README.md
git commit -m "docs: add deployment artifacts (systemd unit, Traefik snippets, deploy script, README)"
```

---

## Self-Review

**Cobertura da spec:** arquitetura Next.js single-process (Tasks 1, 13, 18) ✓; autenticação login único + cookie assinado + rate limit (Tasks 2-3) ✓; camada de dados via `child_process` com cache em memória e refresh configurável (Tasks 4-13) ✓; todos os 8 painéis com a paridade de feature descrita na spec — relógio, pomodoro, e-mail (leitura+corpo+marcar+mover+excluir+lote), agenda, PRs, Jira (filtro+agrupar+abrir), tarefas (CRUD+subtarefas+data+prioridade+recorrência+agrupamento), notificações (Tasks 15-24) ✓; persistência SQLite restrita a `notifications_read` (Task 14) ✓; layout one-page Catppuccin Mocha (Tasks 1, 19-24) ✓; deploy nesta VPS via systemd+Traefik, sem executar nada destrutivo/compartilhado sem o usuário (Task 25) ✓; autenticação headless das CLIs deliberadamente fora do plano, com o app tolerando CLI não configurada (nota na Task 13 e no README da Task 25) ✓; sem CI/CD, sem E2E, sem multi-usuário — nenhuma task introduz nenhum dos três ✓.

**Scan de placeholders:** nenhum "TBD"/"depois"/"tratamento apropriado" encontrado; todo step de código tem o código completo, exceto a nota explícita da Task 5 (Step 6) e Task 10 (docstring) justificando por que aquelas funções finas não ganham teste próprio — não é um placeholder, é uma decisão de escopo documentada com o motivo.

**Consistência de tipos entre tasks:** `Account`, `EmailEnvelope`, `AgendaItem`, `PullsDigest`, `JiraItem`/`JiraRole`/`JiraParent`, `SubTask`/`TaskPriority`/`TodoTask`, `NotificationItem`, `PomodoroPhase`/`PomodoroState`, `PanelResult<T>`, `DashboardState` — definidos uma única vez na Task 1 e reusados literalmente (mesmo nome de campo, mesmo casing) em todas as tasks seguintes; conferido campo a campo contra os testes que os consomem. `TaskPriority` é `'low'|'normal'|'high'` (não `'medium'`) em todo o plano, batendo com o valor real de `importance` do Graph. `JiraFilter`/`Filter` da Task 22 usa os mesmos três valores de `lib/parsers/jira.ts` (Task 8). A separação `lib/parsers/*` (puro) vs. `lib/cli/*` (invoca `runCli`) é consistente em todas as tasks 5-10 e é o que permite `JiraPanel` (client component, Task 22) importar `groupByParent`/`issueMarker` sem puxar `node:child_process` para o bundle do navegador — os demais painéis (Email, Tasks) não importam nada de `lib/cli/*` ou `lib/parsers/*` que dependa de Node, só chamam `fetch` contra as rotas de API.

