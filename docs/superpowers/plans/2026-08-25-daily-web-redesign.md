# daily-web — redesign visual: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir toda a camada visual do daily-web como um produto premium com identidade própria, incluindo um sistema real de filtros/busca, sem alterar nenhuma funcionalidade, rota ou contrato de dados.

**Architecture:** Um sistema de design em CSS custom properties (`app/globals.css`) alimenta primitivos compartilhados (`components/ui/*`) e um elemento-assinatura (`AmbientBackground`) que codifica hora do dia e estado de foco no fundo da página. Os painéis existentes são reescritos consumindo esses primitivos e um módulo puro de filtros (`lib/filters.ts`), mantendo intactas todas as chamadas de API e ações já implementadas.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript estrito, CSS puro com custom properties (sem framework de CSS), fontes Geist via pacote npm `geist`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-25-daily-web-redesign-design.md`

## Global Constraints

- Modo único escuro. Sem alternância de tema.
- Nenhuma mudança em `app/api/**`, `lib/cli/*`, `lib/parsers/*`, `lib/refresher.ts`, `lib/db.ts`, `lib/notifications.ts`, `lib/pomodoro.ts`, `lib/taskGrouping.ts`, `lib/dateParsing.ts`, `lib/api/validation.ts`, `middleware.ts`, `instrumentation.ts`. O contrato de dados (`PanelResult<T>`, `DashboardState`, `TodoTask`, etc. em `lib/types.ts`) não muda.
- Toda ação já existente é preservada: e-mail (listar, ler corpo, marcar lido/não lido, mover, excluir com confirmação, lote), tarefas (criar, editar, concluir, apagar, subtarefas), Jira (filtro de papel, agrupar por pai), PRs (listar, adicionar/remover repo), pomodoro (iniciar, pausar, zerar), notificações (marcar como lida).
- Todo filtro é client-side sobre os dados já em memória. Nenhuma requisição nova ao aplicar/remover filtro.
- `prefers-reduced-motion: reduce` desativa toda transição e animação.
- Foco de teclado sempre visível. Nunca `outline: none` sem substituto.
- Áreas de toque mínimas de 44×44px em mobile.
- Cores exatas conforme a tabela de tokens da spec (`--canvas: #0D0B14`, `--surface: #17141F`, `--surface-hover: #211C2E`, `--hairline: #2C2740`, `--text: #F0EDF7`, `--text-muted: #9891AC`, `--accent: #B48CFF`, `--success: #7FDBB0`, `--warn: #FF9B7A`, `--danger: #FF6B81`).
- Sem classes `.card` ou `.dashboard-grid` (removidas): seções são delimitadas por rótulo eyebrow + hairline, nunca por caixa com borda arredondada.
- `npm run build` e `npx vitest run` devem passar limpos ao final de cada tarefa.

---

## File Structure

```
app/
  globals.css                    (reescrito) sistema de design completo
  layout.tsx                     (modificado) fontes Geist + AmbientBackground
  page.tsx                       (reescrito) layout editorial assimétrico
  login/page.tsx                 (reescrito) tela de login com a nova identidade
components/
  AmbientBackground.tsx          (novo) elemento-assinatura
  NowBand.tsx                    (novo) faixa "agora": relógio + pomodoro + sino
  Clock.tsx                      (reescrito) hero tipográfico
  Pomodoro.tsx                   (reescrito) integrado à faixa
  EmailPanel.tsx                 (reescrito) + filtros
  TasksPanel.tsx                 (reescrito) + filtros
  JiraPanel.tsx                  (reescrito) + filtros em chips
  AgendaPanel.tsx                (reescrito)
  PullsPanel.tsx                 (reescrito)
  NotificationsBell.tsx          (reescrito)
  TaskFormModal.tsx              (reescrito)
  ui/
    Section.tsx                  (novo) cabeçalho eyebrow + hairline + slot de ações
    FilterBar.tsx                (novo) barra de filtros (inline desktop / sheet mobile)
    SearchInput.tsx              (novo)
    Chip.tsx                     (novo) chip alternável e chip removível
    ActiveFilters.tsx            (novo) chips ativos + limpar tudo + contador
    Skeleton.tsx                 (novo) primitivos de carregamento
    EmptyState.tsx               (novo)
    Sheet.tsx                    (novo) bottom sheet mobile
lib/
  filters.ts                     (novo) helpers puros de busca/ordenação
  ambient.ts                     (novo) função pura hora → cor ambiente
tests/
  lib/filters.test.ts            (novo)
  lib/ambient.test.ts            (novo)
  components/*.test.tsx          (atualizados para a nova marcação)
```

---

### Task 1: Fundação — fontes, tokens e primitivas de CSS

**Files:**
- Modify: `package.json` (dependência `geist`)
- Modify: `app/layout.tsx`
- Rewrite: `app/globals.css`

**Interfaces:**
- Consumes: nada.
- Produces: todas as custom properties (`--canvas`, `--surface`, `--surface-hover`, `--hairline`, `--text`, `--text-muted`, `--text-faint`, `--accent`, `--success`, `--warn`, `--danger`, `--step--1`, `--step-0`, `--step-1`, `--step-2`, `--hero`, `--s1`..`--s8`, `--ease`, `--fast`, `--med`, `--ambient-top`, `--ambient-bottom`) e as classes utilitárias (`.shell`, `.columns`, `.col`, `.eyebrow`, `.hairline`, `.btn`, `.btn-primary`, `.btn-ghost`, `.field`, `.mono`, `.sr-only`) usadas por todas as tarefas seguintes. Variáveis de fonte `--font-sans` e `--font-mono`.

- [ ] **Step 1: Instalar a fonte Geist**

Run: `npm install geist`
Expected: instala sem erro; `geist` aparece em `dependencies`.

- [ ] **Step 2: Aplicar as fontes no layout raiz**

`app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { AmbientBackground } from '@/components/AmbientBackground';
import './globals.css';

export const metadata: Metadata = {
  title: 'daily-web',
  description: 'Painel pessoal do dia a dia',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <AmbientBackground />
        {children}
      </body>
    </html>
  );
}
```

Nota: `AmbientBackground` só existe após a Task 2 — o build falha entre a Task 1 e a Task 2, o que é esperado. A Task 2 fecha essa lacuna.

- [ ] **Step 3: Escrever `app/globals.css` completo**

```css
:root {
  --canvas: #0D0B14;
  --surface: #17141F;
  --surface-hover: #211C2E;
  --hairline: #2C2740;
  --hairline-strong: #3A3350;

  --text: #F0EDF7;
  --text-muted: #9891AC;
  --text-faint: #6B6480;

  --accent: #B48CFF;
  --accent-dim: #8B6BC7;
  --success: #7FDBB0;
  --warn: #FF9B7A;
  --danger: #FF6B81;

  --step--1: 0.8125rem;
  --step-0: 0.9375rem;
  --step-1: 1.125rem;
  --step-2: 1.5rem;
  --hero: clamp(3.25rem, 9vw, 6.5rem);

  --s1: 0.25rem;
  --s2: 0.5rem;
  --s3: 0.75rem;
  --s4: 1rem;
  --s5: 1.5rem;
  --s6: 2rem;
  --s7: 3rem;
  --s8: 4rem;

  --ease: cubic-bezier(0.22, 0.61, 0.36, 1);
  --fast: 140ms;
  --med: 220ms;

  --ambient-top: hsl(258 70% 55% / 0.10);
  --ambient-bottom: hsl(228 65% 45% / 0.06);

  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace;
}

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  min-height: 100dvh;
  background: var(--canvas);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--step-0);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, p, ul, ol, figure { margin: 0; }
ul, ol { padding: 0; list-style: none; }
a { color: inherit; }
button, input, select, textarea { font: inherit; color: inherit; }

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}

.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* ---------- layout ---------- */

.shell {
  max-width: 1560px;
  margin: 0 auto;
  padding: 0 var(--s6) var(--s8);
}

.columns {
  display: grid;
  gap: var(--s7) var(--s7);
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  align-items: start;
}

.col { display: flex; flex-direction: column; gap: var(--s7); min-width: 0; }

/* ---------- section chrome ---------- */

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s4);
  padding-bottom: var(--s3);
  border-bottom: 1px solid var(--hairline);
  margin-bottom: var(--s4);
}

.eyebrow {
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.section-count { font-size: var(--step--1); color: var(--text-faint); }

/* ---------- controls ---------- */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s2);
  min-height: 32px;
  padding: 0 var(--s3);
  border: 1px solid var(--hairline);
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--step--1);
  cursor: pointer;
  transition: background var(--fast) var(--ease), color var(--fast) var(--ease),
    border-color var(--fast) var(--ease);
}
.btn:hover { background: var(--surface-hover); color: var(--text); }

.btn-primary {
  border-color: transparent;
  background: var(--accent);
  color: #16101F;
  font-weight: 500;
}
.btn-primary:hover { background: #C6A5FF; color: #16101F; }

.btn-ghost { border-color: transparent; }
.btn-ghost:hover { background: var(--surface-hover); }

.btn-danger:hover { color: var(--danger); border-color: var(--danger); }

.field {
  min-height: 32px;
  padding: 0 var(--s3);
  border: 1px solid var(--hairline);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text);
  font-size: var(--step--1);
}
.field::placeholder { color: var(--text-faint); }
.field:focus { border-color: var(--accent-dim); }

/* ---------- responsive ---------- */

@media (max-width: 1023px) {
  .columns { grid-template-columns: 1fr; gap: var(--s6); }
  .shell { padding: 0 var(--s5) var(--s7); }
}

@media (max-width: 639px) {
  .shell {
    padding: 0 var(--s4) calc(var(--s7) + env(safe-area-inset-bottom));
  }
  .btn, .field { min-height: 44px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Verificar que o CSS carrega**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo referente a `app/layout.tsx` (o erro de módulo não encontrado para `@/components/AmbientBackground` é esperado até a Task 2).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app/globals.css app/layout.tsx
git commit -m "feat(ui): add design tokens, Geist fonts and CSS primitives"
```

---

### Task 2: Elemento-assinatura — fundo ambiente por hora do dia

**Files:**
- Create: `lib/ambient.ts`
- Create: `components/AmbientBackground.tsx`
- Test: `tests/lib/ambient.test.ts`
- Modify: `app/globals.css` (regra `.ambient`)

**Interfaces:**
- Consumes: tokens da Task 1.
- Produces: `ambientForHour(hour: number, focusing: boolean): { top: string; bottom: string }` (puro, testável) e `<AmbientBackground />` (client component sem props, montado uma vez em `app/layout.tsx`).

- [ ] **Step 1: Escrever o teste da função pura**

`tests/lib/ambient.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ambientForHour } from '@/lib/ambient';

describe('ambientForHour', () => {
  it('usa o tom mais frio na madrugada', () => {
    const { top } = ambientForHour(0, false);
    expect(top).toContain('hsl(258');
  });

  it('usa o tom mais quente ao meio-dia', () => {
    const { top } = ambientForHour(12, false);
    expect(top).toContain('hsl(318');
  });

  it('volta ao tom frio à meia-noite seguinte', () => {
    expect(ambientForHour(0, false).top).toBe(ambientForHour(24, false).top);
  });

  it('intensifica a opacidade durante o foco', () => {
    const normal = ambientForHour(12, false);
    const focusing = ambientForHour(12, true);
    expect(focusing.top).not.toBe(normal.top);
    expect(focusing.top).toContain('0.2');
  });

  it('produz cores hsl válidas em qualquer hora', () => {
    for (let h = 0; h < 24; h += 1) {
      const { top, bottom } = ambientForHour(h, false);
      expect(top).toMatch(/^hsl\(\d+ \d+% \d+% \/ [\d.]+\)$/);
      expect(bottom).toMatch(/^hsl\(\d+ \d+% \d+% \/ [\d.]+\)$/);
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/ambient.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ambient'`.

- [ ] **Step 3: Implementar `lib/ambient.ts`**

```ts
export interface AmbientColors {
  top: string;
  bottom: string;
}

// O fundo da página é um segundo relógio: o matiz percorre um arco ao longo
// do dia (violeta frio na madrugada -> rosado quente ao meio-dia -> violeta
// frio de novo à noite) e a opacidade sobe durante uma sessão de foco.
// Puro de propósito: a hora entra como argumento para ser testável.
export function ambientForHour(hour: number, focusing: boolean): AmbientColors {
  const t = (hour % 24) / 24;
  const hue = Math.round(258 + 60 * Math.sin(Math.PI * t));
  const alphaTop = focusing ? 0.22 : 0.1;
  const alphaBottom = focusing ? 0.14 : 0.06;
  return {
    top: `hsl(${hue} 70% 55% / ${alphaTop})`,
    bottom: `hsl(${hue - 30} 65% 45% / ${alphaBottom})`,
  };
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/ambient.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Implementar `components/AmbientBackground.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { ambientForHour } from '@/lib/ambient';

// Lê o estado do pomodoro do cache já publicado em /api/state pelo polling
// do dashboard — não abre uma segunda fonte de verdade nem uma requisição
// própria: escuta o evento que o hook de polling emite.
export function AmbientBackground() {
  const [hour, setHour] = useState<number | null>(null);
  const [focusing, setFocusing] = useState(false);

  useEffect(() => {
    const update = () => setHour(new Date().getHours());
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onFocusChange = (event: Event) => {
      setFocusing((event as CustomEvent<boolean>).detail);
    };
    window.addEventListener('daily-web:focus', onFocusChange);
    return () => window.removeEventListener('daily-web:focus', onFocusChange);
  }, []);

  if (hour === null) return <div className="ambient" aria-hidden="true" />;

  const { top, bottom } = ambientForHour(hour, focusing);
  return (
    <div
      className="ambient"
      aria-hidden="true"
      style={{ '--ambient-top': top, '--ambient-bottom': bottom } as React.CSSProperties}
    />
  );
}
```

- [ ] **Step 6: Acrescentar a regra `.ambient` ao fim de `app/globals.css`**

```css
.ambient {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(120% 75% at 50% -15%, var(--ambient-top), transparent 68%),
    radial-gradient(100% 55% at 50% 115%, var(--ambient-bottom), transparent 70%);
  transition: background 3s linear;
}
```

- [ ] **Step 7: Verificar build e suíte**

Run: `npm run build && npx vitest run`
Expected: build limpo; toda a suíte passa.

- [ ] **Step 8: Commit**

```bash
git add lib/ambient.ts components/AmbientBackground.tsx tests/lib/ambient.test.ts app/globals.css
git commit -m "feat(ui): add time-of-day ambient background signature"
```

---

### Task 3: Primitivos de UI — Section, Skeleton, EmptyState

**Files:**
- Create: `components/ui/Section.tsx`, `components/ui/Skeleton.tsx`, `components/ui/EmptyState.tsx`
- Test: `tests/components/ui/Section.test.tsx`
- Modify: `app/globals.css` (classes `.skeleton`, `.empty`)

**Interfaces:**
- Consumes: tokens da Task 1.
- Produces:
  - `<Section eyebrow={string} count?={string} actions?={ReactNode} children />` — renderiza `<section>` com `<header class="section-head">`, `<h2 class="eyebrow">` e corpo.
  - `<SkeletonRows count={number} />` — linhas de carregamento com a altura real das linhas de conteúdo.
  - `<EmptyState message={string} />` — estado vazio com mensagem específica do painel.

- [ ] **Step 1: Escrever o teste de `Section`**

`tests/components/ui/Section.test.tsx`:
```tsx
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Section } from '@/components/ui/Section';

afterEach(cleanup);

describe('Section', () => {
  it('renderiza o rótulo eyebrow como cabeçalho acessível', () => {
    render(<Section eyebrow="Inbox">conteúdo</Section>);
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
  });

  it('mostra o contador quando fornecido', () => {
    render(<Section eyebrow="Inbox" count="12 de 34">conteúdo</Section>);
    expect(screen.getByText('12 de 34')).toBeInTheDocument();
  });

  it('renderiza as ações do cabeçalho', () => {
    render(
      <Section eyebrow="Tarefas" actions={<button>nova tarefa</button>}>
        conteúdo
      </Section>,
    );
    expect(screen.getByRole('button', { name: 'nova tarefa' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/components/ui/Section.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar os três primitivos**

`components/ui/Section.tsx`:
```tsx
import type { ReactNode } from 'react';

interface Props {
  eyebrow: string;
  count?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function Section({ eyebrow, count, actions, children }: Props) {
  return (
    <section>
      <header className="section-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s3)' }}>
          <h2 className="eyebrow">{eyebrow}</h2>
          {count && <span className="section-count mono">{count}</span>}
        </div>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
```

`components/ui/Skeleton.tsx`:
```tsx
export function SkeletonRows({ count }: { count: number }) {
  return (
    <ul aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="skeleton-row">
          <span className="skeleton" style={{ width: `${55 + ((i * 13) % 35)}%` }} />
        </li>
      ))}
    </ul>
  );
}
```

`components/ui/EmptyState.tsx`:
```tsx
export function EmptyState({ message }: { message: string }) {
  return <p className="empty">{message}</p>;
}
```

- [ ] **Step 4: Acrescentar as classes ao fim de `app/globals.css`**

```css
.section-actions { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }

.skeleton-row { padding: var(--s3) 0; border-bottom: 1px solid var(--hairline); }

.skeleton {
  display: block;
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 50%, var(--surface) 75%);
  background-size: 200% 100%;
  animation: skeleton-sweep 1.4s linear infinite;
}

@keyframes skeleton-sweep {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

.empty {
  padding: var(--s6) 0;
  color: var(--text-faint);
  font-size: var(--step--1);
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `npx vitest run tests/components/ui/Section.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add components/ui tests/components/ui app/globals.css
git commit -m "feat(ui): add Section, Skeleton and EmptyState primitives"
```

---

### Task 4: Sistema de filtros — helpers puros e primitivos de controle

**Files:**
- Create: `lib/filters.ts`
- Create: `components/ui/SearchInput.tsx`, `components/ui/Chip.tsx`, `components/ui/ActiveFilters.tsx`, `components/ui/Sheet.tsx`, `components/ui/FilterBar.tsx`
- Test: `tests/lib/filters.test.ts`, `tests/components/ui/ActiveFilters.test.tsx`
- Modify: `app/globals.css` (classes de filtro e sheet)

**Interfaces:**
- Consumes: tokens da Task 1.
- Produces:
  - `matchesQuery(fields: string[], query: string): boolean` — busca case/acento-insensível.
  - `interface ActiveFilter { id: string; label: string }`
  - `<SearchInput value onChange placeholder label />`
  - `<Chip active onClick children />` (alternável) e `<Chip onRemove label />` (removível)
  - `<ActiveFilters filters={ActiveFilter[]} onRemove={(id) => void} onClearAll={() => void} />`
  - `<FilterBar label={string} children />` — inline no desktop, botão + `<Sheet>` no mobile.
  - `<Sheet open title onClose children />`

- [ ] **Step 1: Escrever o teste dos helpers puros**

`tests/lib/filters.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { matchesQuery } from '@/lib/filters';

describe('matchesQuery', () => {
  it('devolve true quando a busca está vazia', () => {
    expect(matchesQuery(['qualquer coisa'], '')).toBe(true);
    expect(matchesQuery(['qualquer coisa'], '   ')).toBe(true);
  });

  it('acha o termo em qualquer um dos campos', () => {
    expect(matchesQuery(['Assunto do e-mail', 'milton@example.com'], 'milton')).toBe(true);
  });

  it('ignora diferença de maiúsculas', () => {
    expect(matchesQuery(['Revisão do PR'], 'revisão')).toBe(true);
  });

  it('ignora acentos nos dois lados', () => {
    expect(matchesQuery(['Revisão do PR'], 'revisao')).toBe(true);
    expect(matchesQuery(['Revisao do PR'], 'revisão')).toBe(true);
  });

  it('devolve false quando nenhum campo contém o termo', () => {
    expect(matchesQuery(['Assunto', 'remetente'], 'inexistente')).toBe(false);
  });

  it('ignora campos vazios sem quebrar', () => {
    expect(matchesQuery(['', 'texto'], 'texto')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/lib/filters.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `lib/filters.ts`**

```ts
export interface ActiveFilter {
  id: string;
  label: string;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Busca client-side sobre os dados já carregados: acento- e
// caixa-insensível dos dois lados, para "revisao" achar "Revisão".
export function matchesQuery(fields: string[], query: string): boolean {
  const term = normalize(query.trim());
  if (!term) return true;
  return fields.some((field) => normalize(field).includes(term));
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/filters.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Escrever o teste de `ActiveFilters`**

`tests/components/ui/ActiveFilters.test.tsx`:
```tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ActiveFilters } from '@/components/ui/ActiveFilters';

afterEach(cleanup);

describe('ActiveFilters', () => {
  it('não renderiza nada quando não há filtro ativo', () => {
    const { container } = render(
      <ActiveFilters filters={[]} onRemove={() => {}} onClearAll={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('remove um filtro individual pelo id', () => {
    const onRemove = vi.fn();
    render(
      <ActiveFilters
        filters={[{ id: 'unread', label: 'não lidos' }]}
        onRemove={onRemove}
        onClearAll={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'remover filtro não lidos' }));
    expect(onRemove).toHaveBeenCalledWith('unread');
  });

  it('mostra limpar tudo só com mais de um filtro ativo', () => {
    const { rerender } = render(
      <ActiveFilters
        filters={[{ id: 'a', label: 'a' }]}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: 'limpar tudo' })).toBeNull();

    rerender(
      <ActiveFilters
        filters={[{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }]}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'limpar tudo' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Rodar e confirmar falha**

Run: `npx vitest run tests/components/ui/ActiveFilters.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 7: Implementar os primitivos de filtro**

`components/ui/SearchInput.tsx`:
```tsx
'use client';

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}

export function SearchInput({ value, onChange, label, placeholder }: Props) {
  return (
    <input
      type="search"
      className="field filter-search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      placeholder={placeholder ?? 'buscar'}
    />
  );
}
```

`components/ui/Chip.tsx`:
```tsx
'use client';

import type { ReactNode } from 'react';

export function Chip({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`chip${active ? ' chip-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="chip chip-removable">
      {label}
      <button type="button" aria-label={`remover filtro ${label}`} onClick={onRemove}>
        ×
      </button>
    </span>
  );
}
```

`components/ui/ActiveFilters.tsx`:
```tsx
'use client';

import type { ActiveFilter } from '@/lib/filters';
import { RemovableChip } from './Chip';

interface Props {
  filters: ActiveFilter[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

export function ActiveFilters({ filters, onRemove, onClearAll }: Props) {
  if (filters.length === 0) return null;
  return (
    <div className="active-filters">
      {filters.map((f) => (
        <RemovableChip key={f.id} label={f.label} onRemove={() => onRemove(f.id)} />
      ))}
      {filters.length > 1 && (
        <button type="button" className="btn btn-ghost" onClick={onClearAll}>
          limpar tudo
        </button>
      )}
    </div>
  );
}
```

`components/ui/Sheet.tsx`:
```tsx
'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <h2 className="eyebrow">{title}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            aplicar
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
```

`components/ui/FilterBar.tsx`:
```tsx
'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Sheet } from './Sheet';

// No desktop os controles ficam inline; em telas pequenas colapsam num
// botão que abre a mesma coleção de controles numa folha de tela cheia.
export function FilterBar({ label, children }: { label: string; children: ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <>
      <div className="filter-bar">{children}</div>
      <button type="button" className="btn filter-trigger" onClick={() => setSheetOpen(true)}>
        filtrar
      </button>
      <Sheet open={sheetOpen} title={label} onClose={() => setSheetOpen(false)}>
        <div className="filter-sheet-body">{children}</div>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 8: Acrescentar as classes ao fim de `app/globals.css`**

```css
.filter-bar {
  display: flex;
  align-items: center;
  gap: var(--s2);
  flex-wrap: wrap;
  margin-bottom: var(--s4);
}

.filter-search { min-width: 180px; flex: 1 1 180px; max-width: 320px; }

.filter-trigger { display: none; }

.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--s2);
  min-height: 28px;
  padding: 0 var(--s3);
  border: 1px solid var(--hairline);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--step--1);
  cursor: pointer;
  transition: background var(--fast) var(--ease), color var(--fast) var(--ease),
    border-color var(--fast) var(--ease);
}
.chip:hover { background: var(--surface-hover); color: var(--text); }

.chip-active {
  border-color: var(--accent-dim);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text);
}

.chip-removable { cursor: default; padding-right: var(--s2); }
.chip-removable button {
  border: 0;
  background: none;
  color: var(--text-faint);
  cursor: pointer;
  line-height: 1;
  padding: 0 var(--s1);
}
.chip-removable button:hover { color: var(--danger); }

.active-filters {
  display: flex;
  align-items: center;
  gap: var(--s2);
  flex-wrap: wrap;
  margin-bottom: var(--s4);
}

.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(6, 4, 12, 0.6);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-end;
}

.sheet {
  width: 100%;
  max-height: 85dvh;
  overflow-y: auto;
  padding: var(--s5) var(--s5) calc(var(--s5) + env(safe-area-inset-bottom));
  background: var(--surface);
  border-top: 1px solid var(--hairline-strong);
  border-radius: 18px 18px 0 0;
  animation: sheet-in var(--med) var(--ease);
}

@keyframes sheet-in {
  from { transform: translateY(12px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--s4);
}

.filter-sheet-body { display: flex; flex-direction: column; gap: var(--s3); align-items: stretch; }

@media (max-width: 639px) {
  .filter-bar { display: none; }
  .filter-trigger { display: inline-flex; }
  .chip { min-height: 40px; }
}
```

- [ ] **Step 9: Rodar e confirmar sucesso**

Run: `npx vitest run tests/lib/filters.test.ts tests/components/ui/ActiveFilters.test.tsx`
Expected: PASS (9 testes no total).

- [ ] **Step 10: Commit**

```bash
git add lib/filters.ts components/ui tests/lib/filters.test.ts tests/components/ui/ActiveFilters.test.tsx app/globals.css
git commit -m "feat(ui): add filter primitives and pure search helpers"
```

---

### Task 5: Faixa "agora" — Clock, Pomodoro e NowBand

**Files:**
- Rewrite: `components/Clock.tsx`, `components/Pomodoro.tsx`
- Create: `components/NowBand.tsx`
- Test: `tests/components/Clock.test.tsx` (atualizado), `tests/components/Pomodoro.test.tsx` (atualizado)
- Modify: `app/globals.css` (classes `.now-*`)

**Interfaces:**
- Consumes: `PomodoroState` (`lib/types.ts`), tokens da Task 1.
- Produces: `<NowBand pomodoro={PomodoroState | null} loading={boolean} onRefresh={() => void} onChanged={() => void} bell={ReactNode} />`. `Clock` e `Pomodoro` continuam exportando os mesmos nomes com as mesmas props (`<Clock />`, `<Pomodoro pomodoro onChanged />`).

Comportamento preservado: `Pomodoro` retorna `null` quando `pomodoro` é nulo ou `enabled === false`; `toggle` chama `/api/pomodoro/pause` quando `running`, senão `/api/pomodoro/start`; `reset` chama `/api/pomodoro/reset`; ambos checam `res.ok`, mostram erro em `role="alert"` e só chamam `onChanged` no sucesso; `notifyPhaseChange` usa a Notification API do navegador e **não** faz POST de fallback.

Novo: quando a fase muda ou o estado de `running` muda, `Pomodoro` emite `window.dispatchEvent(new CustomEvent('daily-web:focus', { detail: running && phase === 'focus' }))` para alimentar o `AmbientBackground` da Task 2.

- [ ] **Step 1: Atualizar o teste de `Clock` para a nova marcação**

`tests/components/Clock.test.tsx`:
```tsx
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Clock } from '@/components/Clock';

afterEach(cleanup);

describe('Clock', () => {
  it('renderiza a hora no formato HH:MM:SS', () => {
    render(<Clock />);
    expect(screen.getByTestId('clock-time').textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('renderiza a data por extenso em português', () => {
    render(<Clock />);
    expect(screen.getByTestId('clock-date').textContent).toMatch(
      /(domingo|segunda|terça|quarta|quinta|sexta|sábado)/,
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/components/Clock.test.tsx`
Expected: FAIL — `clock-time` não existe na marcação atual.

- [ ] **Step 3: Reescrever `components/Clock.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Reserva a altura final desde o primeiro render para não causar
  // layout shift quando o relógio começa a marcar.
  if (!now) {
    return (
      <div className="now-clock">
        <span className="now-time mono" data-testid="clock-time">&nbsp;</span>
        <span className="now-date" data-testid="clock-date">&nbsp;</span>
      </div>
    );
  }

  return (
    <div className="now-clock">
      <time className="now-time mono" data-testid="clock-time">
        {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
      </time>
      <span className="now-date" data-testid="clock-date">
        {WEEKDAYS[now.getDay()]}, {now.getDate()} de {MONTHS[now.getMonth()]}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run tests/components/Clock.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 5: Atualizar o teste de `Pomodoro`**

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
  enabled: true,
  phase: 'focus' as const,
  running: false,
  remainingSeconds: 90,
  focusMinutes: 25,
  restMinutes: 5,
  completedFocusCount: 2,
};

describe('Pomodoro', () => {
  it('mostra a fase, o tempo restante e o contador de focos', () => {
    render(<Pomodoro pomodoro={base} onChanged={() => {}} />);
    const text = screen.getByTestId('pomodoro').textContent ?? '';
    expect(text).toContain('foco');
    expect(text).toContain('01:30');
    expect(text).toContain('2');
  });

  it('não renderiza nada quando o pomodoro está desligado', () => {
    render(<Pomodoro pomodoro={{ ...base, enabled: false }} onChanged={() => {}} />);
    expect(screen.queryByTestId('pomodoro')).toBeNull();
  });

  it('clicar em iniciar chama a API de start e avisa onChanged', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const onChanged = vi.fn();
    render(<Pomodoro pomodoro={base} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'iniciar foco' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/pomodoro/start', { method: 'POST' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('mostra pausar quando já está rodando', () => {
    render(<Pomodoro pomodoro={{ ...base, running: true }} onChanged={() => {}} />);
    expect(screen.getByRole('button', { name: 'pausar foco' })).toBeInTheDocument();
  });

  it('mostra erro e não avisa onChanged quando a API falha', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'falhou' }), { status: 502 }),
    );
    const onChanged = vi.fn();
    render(<Pomodoro pomodoro={base} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'iniciar foco' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('falhou'));
    expect(onChanged).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Rodar e confirmar falha**

Run: `npx vitest run tests/components/Pomodoro.test.tsx`
Expected: FAIL — os nomes acessíveis dos botões mudaram.

- [ ] **Step 7: Reescrever `components/Pomodoro.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
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

// instrumentation.ts já dispara o push do ntfy a cada transição real de
// fase, mesmo sem aba aberta. Aqui só existe o caminho PRIMÁRIO: a
// Notification API do navegador quando a aba está aberta com permissão.
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
}

export function Pomodoro({ pomodoro, onChanged }: Props) {
  const lastPhase = useRef<PomodoroPhase | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pomodoro) return;
    if (lastPhase.current !== null && lastPhase.current !== pomodoro.phase) {
      notifyPhaseChange(pomodoro.phase);
    }
    lastPhase.current = pomodoro.phase;
  }, [pomodoro?.phase]);

  // Alimenta o fundo ambiente: a tela inteira esquenta durante o foco.
  useEffect(() => {
    const focusing = Boolean(pomodoro?.running && pomodoro.phase === 'focus');
    window.dispatchEvent(new CustomEvent('daily-web:focus', { detail: focusing }));
  }, [pomodoro?.running, pomodoro?.phase]);

  if (!pomodoro || !pomodoro.enabled) return null;

  const post = async (url: string, fallback: string) => {
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? fallback);
      return;
    }
    setError(null);
    onChanged();
  };

  const isFocus = pomodoro.phase === 'focus';
  const total = (isFocus ? pomodoro.focusMinutes : pomodoro.restMinutes) * 60;
  const progress = total > 0 ? 1 - pomodoro.remainingSeconds / total : 0;

  return (
    <div className="now-pomodoro" data-testid="pomodoro">
      <div className="now-pomo-meter" aria-hidden="true">
        <span
          className={`now-pomo-fill${isFocus ? ' is-focus' : ' is-rest'}`}
          style={{ transform: `scaleX(${Math.min(Math.max(progress, 0), 1)})` }}
        />
      </div>
      <div className="now-pomo-info">
        <span className="now-pomo-phase">{isFocus ? 'foco' : 'descanso'}</span>
        <span className="now-pomo-time mono">{formatRemaining(pomodoro.remainingSeconds)}</span>
        <span className="now-pomo-count mono" title="focos concluídos hoje">
          {pomodoro.completedFocusCount}
        </span>
      </div>
      <div className="now-pomo-actions">
        <button
          type="button"
          className="btn"
          aria-label={pomodoro.running ? 'pausar foco' : 'iniciar foco'}
          onClick={() =>
            void post(
              pomodoro.running ? '/api/pomodoro/pause' : '/api/pomodoro/start',
              'falha ao atualizar pomodoro',
            )
          }
        >
          {pomodoro.running ? 'pausar' : 'iniciar'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          aria-label="zerar pomodoro"
          onClick={() => void post('/api/pomodoro/reset', 'falha ao zerar pomodoro')}
        >
          zerar
        </button>
      </div>
      {error && (
        <span role="alert" className="now-pomo-error">
          {error}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Implementar `components/NowBand.tsx`**

```tsx
'use client';

import type { ReactNode } from 'react';
import type { PomodoroState } from '@/lib/types';
import { Clock } from './Clock';
import { Pomodoro } from './Pomodoro';

interface Props {
  pomodoro: PomodoroState | null;
  loading: boolean;
  onRefresh: () => void;
  onChanged: () => void;
  bell: ReactNode;
  updatedAt: string | null;
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return 'sincronizando';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'sincronizando';
  return `atualizado ${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export function NowBand({ pomodoro, loading, onRefresh, onChanged, bell, updatedAt }: Props) {
  return (
    <header className="now">
      <div className="now-main">
        <Clock />
        <Pomodoro pomodoro={pomodoro} onChanged={onChanged} />
      </div>
      <div className="now-aside">
        <span className="now-sync mono">{formatUpdatedAt(updatedAt)}</span>
        <button type="button" className="btn" onClick={onRefresh} disabled={loading}>
          {loading ? 'atualizando' : 'atualizar'}
        </button>
        {bell}
      </div>
    </header>
  );
}
```

- [ ] **Step 9: Acrescentar as classes ao fim de `app/globals.css`**

```css
.now {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s5);
  flex-wrap: wrap;
  padding: var(--s8) 0 var(--s6);
  border-bottom: 1px solid var(--hairline);
  margin-bottom: var(--s7);
}

.now-main { display: flex; align-items: flex-end; gap: var(--s7); flex-wrap: wrap; }

.now-clock { display: flex; flex-direction: column; gap: var(--s1); }

.now-time {
  font-size: var(--hero);
  font-weight: 300;
  line-height: 0.92;
  letter-spacing: -0.03em;
  color: var(--text);
}

.now-date { font-size: var(--step-0); color: var(--text-muted); }

.now-pomodoro { display: flex; flex-direction: column; gap: var(--s2); padding-bottom: var(--s2); }

.now-pomo-meter {
  width: 168px;
  height: 2px;
  background: var(--hairline);
  overflow: hidden;
}

.now-pomo-fill {
  display: block;
  height: 100%;
  width: 100%;
  transform-origin: left center;
  transition: transform 1s linear;
}
.now-pomo-fill.is-focus { background: var(--accent); }
.now-pomo-fill.is-rest { background: var(--success); }

.now-pomo-info { display: flex; align-items: baseline; gap: var(--s3); }
.now-pomo-phase { font-size: var(--step--1); color: var(--text-muted); }
.now-pomo-time { font-size: var(--step-1); color: var(--text); }
.now-pomo-count { font-size: var(--step--1); color: var(--text-faint); }
.now-pomo-actions { display: flex; gap: var(--s2); }
.now-pomo-error { font-size: var(--step--1); color: var(--danger); }

.now-aside { display: flex; align-items: center; gap: var(--s3); }
.now-sync { font-size: var(--step--1); color: var(--text-faint); }

@media (max-width: 639px) {
  .now {
    padding: var(--s6) 0 var(--s5);
    align-items: flex-start;
    flex-direction: column;
  }
  .now-main { gap: var(--s5); }
  .now-aside { width: 100%; justify-content: space-between; }
}
```

- [ ] **Step 10: Rodar os testes e confirmar sucesso**

Run: `npx vitest run tests/components/Clock.test.tsx tests/components/Pomodoro.test.tsx`
Expected: PASS (7 testes).

- [ ] **Step 11: Commit**

```bash
git add components/Clock.tsx components/Pomodoro.tsx components/NowBand.tsx tests/components/Clock.test.tsx tests/components/Pomodoro.test.tsx app/globals.css
git commit -m "feat(ui): rebuild clock and pomodoro as the now band"
```

---

### Task 6: Painel de e-mail com filtros

**Files:**
- Rewrite: `components/EmailPanel.tsx`
- Test: `tests/components/EmailPanel.test.tsx` (atualizado)
- Modify: `app/globals.css` (classes `.row`, `.mail-*`)

**Interfaces:**
- Consumes: `Section`, `FilterBar`, `SearchInput`, `Chip`, `ActiveFilters`, `EmptyState` (Tasks 3-4); `matchesQuery` (Task 4); `EmailEnvelope`, `PanelResult` (`lib/types.ts`).
- Produces: `<EmailPanel email={PanelResult<EmailEnvelope[]>} onChanged={() => void} />` (mesma assinatura de hoje).

Comportamento preservado integralmente: seleção múltipla por checkbox; ações em lote lendo `{ results: [...] }` de `POST /api/email/batch` com relato por alvo e reseleção só dos que falharam; busca de pastas em `GET /api/email/folders?account=` para os alvos selecionados; `mover` com `action: 'move'` + `folder`; abrir o corpo via `GET /api/email/[account]/[id]/body` e só então marcar como lido via `POST /api/email/mark`; excluir com `window.confirm` antes.

Novo: filtro de busca (assunto + remetente via `matchesQuery`), chip "não lidos", chip de conta ("trabalho"/"pessoal"), ordenação (recentes/antigos), contador "X de Y" no cabeçalho da seção, chips de filtro ativo removíveis.

- [ ] **Step 1: Atualizar o teste de `EmailPanel`**

`tests/components/EmailPanel.test.tsx`:
```tsx
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { EmailPanel } from '@/components/EmailPanel';
import type { EmailEnvelope } from '@/lib/types';

const items: EmailEnvelope[] = [
  { id: '1', account: 'work', from: 'Milton Yoshida', subject: 'Revisão do PR', unread: true, date: '2026-08-25T10:00:00Z' },
  { id: '2', account: 'personal', from: 'GitHub', subject: 'Token adicionado', unread: false, date: '2026-08-24T10:00:00Z' },
];

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ folders: [] })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EmailPanel', () => {
  it('lista os e-mails com assunto e remetente', () => {
    render(<EmailPanel email={{ data: items, error: null }} onChanged={() => {}} />);
    expect(screen.getByText('Revisão do PR')).toBeInTheDocument();
    expect(screen.getByText('Milton Yoshida')).toBeInTheDocument();
  });

  it('filtra por busca textual sem chamar a API', () => {
    render(<EmailPanel email={{ data: items, error: null }} onChanged={() => {}} />);
    const before = vi.mocked(global.fetch).mock.calls.length;
    fireEvent.change(screen.getByLabelText('buscar e-mails'), { target: { value: 'token' } });
    expect(screen.queryByText('Revisão do PR')).toBeNull();
    expect(screen.getByText('Token adicionado')).toBeInTheDocument();
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(before);
  });

  it('filtra por não lidos e mostra o contador de resultados', () => {
    render(<EmailPanel email={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'não lidos' }));
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
    expect(screen.queryByText('Token adicionado')).toBeNull();
  });

  it('remove um filtro ativo pelo chip', () => {
    render(<EmailPanel email={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'não lidos' }));
    fireEvent.click(screen.getByRole('button', { name: 'remover filtro não lidos' }));
    expect(screen.getByText('Token adicionado')).toBeInTheDocument();
  });

  it('mostra o estado vazio quando o filtro não acha nada', () => {
    render(<EmailPanel email={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('buscar e-mails'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/nenhum e-mail/i)).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<EmailPanel email={{ data: null, error: 'himalaya falhou' }} onChanged={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('himalaya falhou');
  });

  it('marca em lote e reseleciona só os que falharam', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ results: [{ account: 'work', id: '1', ok: false, error: 'x' }] })),
    );
    const onChanged = vi.fn();
    render(<EmailPanel email={{ data: items, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText('selecionar Revisão do PR'));
    fireEvent.click(screen.getByRole('button', { name: 'marcar lido' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('falharam'));
    expect(onChanged).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/components/EmailPanel.test.tsx`
Expected: FAIL — os novos controles de filtro não existem.

- [ ] **Step 3: Reescrever `components/EmailPanel.tsx`**

Estrutura obrigatória (mantendo toda a lógica de lote/pastas/detalhe já existente, apenas reorganizada):

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import type { EmailEnvelope, PanelResult } from '@/lib/types';
import type { ActiveFilter } from '@/lib/filters';
import { matchesQuery } from '@/lib/filters';
import { Section } from './ui/Section';
import { FilterBar } from './ui/FilterBar';
import { SearchInput } from './ui/SearchInput';
import { Chip } from './ui/Chip';
import { ActiveFilters } from './ui/ActiveFilters';
import { EmptyState } from './ui/EmptyState';

type Sort = 'recent' | 'oldest';
type AccountFilter = 'all' | 'work' | 'personal';

interface BatchTargetResult { account: string; id: string; ok: boolean; error?: string }

function key(m: EmailEnvelope): string { return `${m.account}:${m.id}`; }

async function postJson(url: string, body: unknown) {
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function postBatch(
  targets: { account: string; id: string }[],
  action: 'read' | 'unread' | 'delete' | 'move',
  folder?: string,
): Promise<BatchTargetResult[]> {
  const res = await fetch('/api/email/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(folder !== undefined ? { targets, action, folder } : { targets, action }),
  });
  const data = await res.json();
  return (data.results ?? []) as BatchTargetResult[];
}
```

O componente mantém os estados `selected`, `openKey`, `batchError`, `folders`, `targetFolder` e as funções `toggleSelect`, `runBatch`, o `useEffect` de pastas e o subcomponente `EmailDetail` exatamente com a lógica atual (incluindo `window.confirm` na exclusão e a ordem corpo→marcar-lido). Acrescenta os estados de filtro `query`, `onlyUnread`, `accountFilter`, `sort`, deriva:

```tsx
const visible = useMemo(() => {
  const all = email.data ?? [];
  const filtered = all.filter(
    (m) =>
      matchesQuery([m.subject, m.from], query) &&
      (!onlyUnread || m.unread) &&
      (accountFilter === 'all' || m.account === accountFilter),
  );
  return [...filtered].sort((a, b) =>
    sort === 'recent' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
  );
}, [email.data, query, onlyUnread, accountFilter, sort]);

const total = (email.data ?? []).length;
const activeFilters: ActiveFilter[] = [
  ...(query.trim() ? [{ id: 'query', label: `busca: ${query.trim()}` }] : []),
  ...(onlyUnread ? [{ id: 'unread', label: 'não lidos' }] : []),
  ...(accountFilter !== 'all'
    ? [{ id: 'account', label: accountFilter === 'work' ? 'trabalho' : 'pessoal' }]
    : []),
];
```

e renderiza dentro de `<Section eyebrow="Inbox" count={activeFilters.length > 0 ? \`${visible.length} de ${total}\` : undefined} actions={...ações de lote quando há seleção...}>` a `<FilterBar label="Filtrar e-mails">` com `<SearchInput label="buscar e-mails" />`, `<Chip active={onlyUnread}>não lidos</Chip>`, chips de conta e um `<select className="field">` de ordenação; abaixo `<ActiveFilters />`; depois a lista em `<ul>` de `<li className="row">`, e `<EmptyState message="Nenhum e-mail com esses filtros." />` quando `visible.length === 0` e `total > 0`, ou `"Caixa de entrada limpa."` quando `total === 0`.

Cada linha usa a marcação:
```tsx
<li key={key(m)} className={`row${m.unread ? ' row-unread' : ''}`}>
  <input type="checkbox" checked={selected.has(key(m))} onChange={() => toggleSelect(m)} aria-label={`selecionar ${m.subject}`} />
  <button type="button" className="row-main" onClick={() => setOpenKey(key(m))}>
    <span className="row-title">{m.subject || '(sem assunto)'}</span>
    <span className="row-meta">{m.from}</span>
  </button>
  <span className="row-tag mono">{m.account === 'work' ? 'W' : 'P'}</span>
</li>
```

- [ ] **Step 4: Acrescentar as classes de linha ao fim de `app/globals.css`**

```css
.row {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s2);
  border-bottom: 1px solid var(--hairline);
  border-radius: 6px;
  transition: background var(--fast) var(--ease);
}
.row:hover { background: var(--surface-hover); }

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  padding: 0;
}

.row-title {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-unread .row-title { color: var(--text); font-weight: 500; }

.row-meta { font-size: var(--step--1); color: var(--text-faint); }

.row-tag {
  font-size: 0.6875rem;
  color: var(--text-faint);
  border: 1px solid var(--hairline);
  border-radius: 4px;
  padding: 1px 5px;
}

.row-unread::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  flex: none;
}
.row:not(.row-unread)::before { content: ''; width: 5px; flex: none; }
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `npx vitest run tests/components/EmailPanel.test.tsx`
Expected: PASS (7 testes).

- [ ] **Step 6: Commit**

```bash
git add components/EmailPanel.tsx tests/components/EmailPanel.test.tsx app/globals.css
git commit -m "feat(ui): rebuild email panel with search and filters"
```

---

### Task 7: Painel de tarefas e formulário

**Files:**
- Rewrite: `components/TasksPanel.tsx`, `components/TaskFormModal.tsx`
- Test: `tests/components/TasksPanel.test.tsx`, `tests/components/TaskFormModal.test.tsx` (atualizados)
- Modify: `app/globals.css` (classes `.task-*`, `.modal-*`)

**Interfaces:**
- Consumes: primitivos das Tasks 3-4; `groupTasksByDueWindow` (`lib/taskGrouping.ts`, inalterado); `TodoTask`, `TaskPriority`, `PanelResult`.
- Produces: `<TasksPanel tasks={PanelResult<TodoTask[]>} onChanged={() => void} />`, `<TaskFormModal task={TodoTask | null} onClose onSaved />` (mesmas assinaturas de hoje).

Comportamento preservado: concluir/reabrir via `PATCH /api/tasks/[id]` com `{completed}`; apagar via `DELETE`; subtarefas via `POST/PATCH/DELETE /api/tasks/[id]/subtasks[/itemId]`; formulário criando com `POST /api/tasks` e editando com `PATCH /api/tasks/[id]`, com ciclos de prioridade (`normal → high → low`) e recorrência (`none → daily → weekly → monthly`), campo de vencimento em texto livre e exibição de erro vindo do servidor; toda ação checa `res.ok` e mostra erro.

Novo: busca textual por título, chips de prioridade, chips de faixa de prazo (as faixas de `groupTasksByDueWindow` viram filtros clicáveis), contador de resultados, chips ativos removíveis. O formulário vira um diálogo centrado com backdrop desfocado, fecha com `Escape`, e o campo de vencimento ganha exemplos visíveis.

- [ ] **Step 1: Atualizar o teste de `TasksPanel`**

`tests/components/TasksPanel.test.tsx`:
```tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TasksPanel } from '@/components/TasksPanel';
import type { TodoTask } from '@/lib/types';

function task(over: Partial<TodoTask>): TodoTask {
  return {
    id: '1', title: 'Tarefa', completed: false, due: '', priority: 'normal',
    time: '', recur: '', notes: '', subtasks: [], ...over,
  };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('TasksPanel', () => {
  it('lista as tarefas agrupadas por faixa de prazo', () => {
    render(
      <TasksPanel
        tasks={{ data: [task({ id: '1', title: 'Sem data' })], error: null }}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText('Sem data')).toBeInTheDocument();
  });

  it('filtra por busca textual', () => {
    render(
      <TasksPanel
        tasks={{ data: [task({ id: '1', title: 'Comprar pão' }), task({ id: '2', title: 'Revisar PR' })], error: null }}
        onChanged={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('buscar tarefas'), { target: { value: 'pão' } });
    expect(screen.getByText('Comprar pão')).toBeInTheDocument();
    expect(screen.queryByText('Revisar PR')).toBeNull();
  });

  it('filtra por prioridade alta', () => {
    render(
      <TasksPanel
        tasks={{ data: [task({ id: '1', title: 'Urgente', priority: 'high' }), task({ id: '2', title: 'Normal' })], error: null }}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'alta' }));
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.queryByText('Normal')).toBeNull();
  });

  it('conclui uma tarefa e avisa onChanged', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const onChanged = vi.fn();
    render(<TasksPanel tasks={{ data: [task({})], error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText('concluir Tarefa'));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/tasks/1', expect.objectContaining({ method: 'PATCH' })),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('mostra erro e não avisa onChanged quando concluir falha', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'mstodo falhou' }), { status: 502 }),
    );
    const onChanged = vi.fn();
    render(<TasksPanel tasks={{ data: [task({})], error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByLabelText('concluir Tarefa'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('mstodo falhou'));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('marca e desmarca uma subtarefa pela API certa', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    render(
      <TasksPanel
        tasks={{ data: [task({ subtasks: [{ id: 's1', title: 'Etapa', completed: false }] })], error: null }}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('concluir subtarefa Etapa'));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/tasks/1/subtasks/s1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ completed: true }) }),
      ),
    );
  });

  it('mostra o estado vazio quando não há tarefas', () => {
    render(<TasksPanel tasks={{ data: [], error: null }} onChanged={() => {}} />);
    expect(screen.getByText(/nenhuma tarefa/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/components/TasksPanel.test.tsx`
Expected: FAIL — controles de filtro ausentes.

- [ ] **Step 3: Reescrever `components/TasksPanel.tsx`**

Mantém `SubtaskList` com a lógica atual (toggle/add/remove chamando as mesmas rotas, checando `res.ok`, reportando erro via `onError`) e as funções `toggleComplete`/`remove` do painel. Acrescenta estados `query`, `priorityFilter: TaskPriority | 'all'`, `windowFilter: TaskGroupKey | 'all'`, deriva a lista visível aplicando `matchesQuery([t.title], query)` e os dois filtros antes de chamar `groupTasksByDueWindow`, e renderiza dentro de `<Section eyebrow="Tarefas" count={...} actions={<button className="btn btn-primary" onClick={() => setEditing('new')}>nova tarefa</button>}>`.

A faixa de prazo de cada grupo vira `<h3 className="task-group-label eyebrow">`; cada tarefa é uma `<li className="row task-row">` com checkbox (`aria-label={\`concluir ${task.title}\`}`), título como botão que abre a edição, marcador de prioridade textual **e** cromático (`<span className="task-flag task-flag-high">alta</span>` — nunca só cor), `↻` quando `recur !== ''`, data em `.mono`, botão apagar, e `SubtaskList` aninhada.

- [ ] **Step 4: Reescrever `components/TaskFormModal.tsx`**

Mesma lógica de salvar/ciclar de hoje, com a marcação:
```tsx
<div className="modal-backdrop" onClick={onClose}>
  <div className="modal" role="dialog" aria-modal="true" aria-label="formulário de tarefa" onClick={(e) => e.stopPropagation()}>
    …campos…
  </div>
</div>
```
e um `useEffect` que fecha com `Escape`. Os rótulos e o texto de ajuda do campo de vencimento (`hoje, amanhã, +3d, AAAA-MM-DD, com hora opcional`) são preservados.

- [ ] **Step 5: Acrescentar as classes ao fim de `app/globals.css`**

```css
.task-group-label { display: block; margin: var(--s5) 0 var(--s2); }
.task-group-label:first-child { margin-top: 0; }

.task-row.is-done .row-title { color: var(--text-faint); text-decoration: line-through; }

.task-flag {
  font-size: 0.6875rem;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid currentColor;
}
.task-flag-high { color: var(--warn); }
.task-flag-low { color: var(--text-faint); }

.task-due { font-size: var(--step--1); color: var(--text-faint); }

.subtasks { margin: var(--s2) 0 var(--s2) var(--s6); display: flex; flex-direction: column; gap: var(--s1); }
.subtask { display: flex; align-items: center; gap: var(--s2); font-size: var(--step--1); color: var(--text-muted); }
.subtask.is-done { color: var(--text-faint); text-decoration: line-through; }
.subtask-add { display: flex; gap: var(--s2); margin-top: var(--s1); }

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--s5);
  background: rgba(6, 4, 12, 0.62);
  backdrop-filter: blur(8px);
  animation: fade-in var(--med) var(--ease);
}

.modal {
  width: min(460px, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--s4);
  padding: var(--s6);
  background: var(--surface);
  border: 1px solid var(--hairline-strong);
  border-radius: 16px;
  animation: modal-in var(--med) var(--ease);
}

.modal label { display: flex; flex-direction: column; gap: var(--s2); font-size: var(--step--1); color: var(--text-muted); }
.modal-hint { font-size: 0.75rem; color: var(--text-faint); }
.modal-actions { display: flex; justify-content: flex-end; gap: var(--s2); }

@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes modal-in {
  from { opacity: 0; transform: translateY(8px) scale(0.99); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (max-width: 639px) {
  .modal-backdrop { align-items: flex-end; padding: 0; }
  .modal {
    width: 100%;
    border-radius: 18px 18px 0 0;
    padding: var(--s5) var(--s5) calc(var(--s5) + env(safe-area-inset-bottom));
  }
}
```

- [ ] **Step 6: Rodar os testes e confirmar sucesso**

Run: `npx vitest run tests/components/TasksPanel.test.tsx tests/components/TaskFormModal.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/TasksPanel.tsx components/TaskFormModal.tsx tests/components/TasksPanel.test.tsx tests/components/TaskFormModal.test.tsx app/globals.css
git commit -m "feat(ui): rebuild tasks panel and form with filters"
```

---

### Task 8: Painéis Jira, Agenda e PRs

**Files:**
- Rewrite: `components/JiraPanel.tsx`, `components/AgendaPanel.tsx`, `components/PullsPanel.tsx`
- Test: `tests/components/JiraPanel.test.tsx`, `tests/components/AgendaPanel.test.tsx`, `tests/components/PullsPanel.test.tsx` (atualizados)
- Modify: `app/globals.css` (classes `.jira-*`, `.agenda-*`, `.pulls-*`)

**Interfaces:**
- Consumes: primitivos das Tasks 3-4; `groupByParent`, `issueMarker` (`lib/parsers/jira.ts`, inalterado); `JiraItem`, `AgendaItem`, `PullsDigest`, `PanelResult`.
- Produces: `<JiraPanel jira={PanelResult<JiraItem[]>} />`, `<AgendaPanel agenda={PanelResult<AgendaItem[]>} />`, `<PullsPanel pulls={PanelResult<PullsDigest>} className?={string} onChanged?={() => void} />` (mesmas assinaturas de hoje).

Comportamento preservado: Jira mantém o filtro de papel com a regra `filter === 'both' || i.role === filter || i.role === 'both'` e o agrupar-por-pai; Agenda agrupa por data ordenada com marcador de conta e "dia inteiro" quando não há hora; PRs mantém busca/adição/remoção de repos rastreados em `/api/pulls/repos` com validação e erro visível.

Novo: Jira ganha busca textual (chave + resumo) e os três papéis como chips (em vez de um botão que cicla), com contador; Agenda ganha cabeçalhos de dia relativos ("hoje", "amanhã", depois a data por extenso); PRs ganha o gerenciador de repositórios num bloco discreto no rodapé da seção, não no meio do conteúdo.

- [ ] **Step 1: Atualizar o teste de `JiraPanel`**

`tests/components/JiraPanel.test.tsx`:
```tsx
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { JiraPanel } from '@/components/JiraPanel';
import type { JiraItem } from '@/lib/types';

function issue(over: Partial<JiraItem>): JiraItem {
  return {
    key: 'A-1', summary: 'Resumo', status: 'Aberto', project: 'A',
    url: 'https://example/A-1', parent: null, role: 'assignee', kind: 'História',
    subtask: false, ...over,
  };
}

afterEach(cleanup);

describe('JiraPanel', () => {
  it('lista as issues com chave e resumo', () => {
    render(<JiraPanel jira={{ data: [issue({})], error: null }} />);
    expect(screen.getByText('A-1')).toBeInTheDocument();
    expect(screen.getByText(/Resumo/)).toBeInTheDocument();
  });

  it('mostra issues com papel both no filtro minhas', () => {
    render(
      <JiraPanel
        jira={{
          data: [issue({ key: 'A-1', role: 'reporter' }), issue({ key: 'A-2', role: 'both' })],
          error: null,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'minhas' }));
    expect(screen.getByText('A-2')).toBeInTheDocument();
    expect(screen.queryByText('A-1')).toBeNull();
  });

  it('filtra por busca textual', () => {
    render(
      <JiraPanel
        jira={{
          data: [issue({ key: 'A-1', summary: 'Corrigir login' }), issue({ key: 'A-2', summary: 'Ajustar deploy' })],
          error: null,
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText('buscar issues'), { target: { value: 'login' } });
    expect(screen.getByText('A-1')).toBeInTheDocument();
    expect(screen.queryByText('A-2')).toBeNull();
  });

  it('agrupa por pai quando solicitado', () => {
    render(
      <JiraPanel
        jira={{
          data: [issue({ key: 'A-9', parent: { key: 'A-1', summary: 'Épico pai' } })],
          error: null,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'agrupar por pai' }));
    expect(screen.getByText('Épico pai')).toBeInTheDocument();
  });

  it('mostra o erro do painel quando presente', () => {
    render(<JiraPanel jira={{ data: null, error: 'jira falhou' }} />);
    expect(screen.getByRole('alert').textContent).toContain('jira falhou');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/components/JiraPanel.test.tsx`
Expected: FAIL — chips e busca não existem.

- [ ] **Step 3: Reescrever os três painéis**

`JiraPanel`: estados `query`, `filter: 'both' | 'assignee' | 'reporter'`, `grouped`. Lista visível = `(jira.data ?? []).filter((i) => matchesQuery([i.key, i.summary], query) && (filter === 'both' || i.role === filter || i.role === 'both'))`. Chips com `aria-label` "ambas"/"minhas"/"relator" e um `<Chip>` alternável "agrupar por pai". Cada linha: marcador de tipo em `.mono`, chave como link externo, resumo, e o badge de papel (`REL`/`RES`) só quando `filter === 'both'` — com texto, não só cor.

`AgendaPanel`: mantém `groupByDate`; cada grupo ganha um cabeçalho relativo calculado com a data local (`hoje` / `amanhã` / `sábado, 29 de agosto`); cada item vira `.agenda-item` com a hora em `.mono` (ou "dia inteiro") e o marcador de conta.

`PullsPanel`: mantém `loadRepos`/`addRepo`/`removeRepo` com as mesmas chamadas e checagem de `res.ok`; o digest é renderizado em `.pulls-line` (preservando `renderLine` com detecção de URL); o gerenciador de repositórios vai para um `<details className="pulls-repos">` no rodapé da seção, com `<summary>repositórios rastreados</summary>`.

- [ ] **Step 4: Acrescentar as classes ao fim de `app/globals.css`**

```css
.jira-row { display: flex; align-items: baseline; gap: var(--s3); padding: var(--s2) 0; border-bottom: 1px solid var(--hairline); }
.jira-kind { font-size: 0.6875rem; color: var(--text-faint); }
.jira-key { font-size: var(--step--1); color: var(--accent); text-decoration: none; }
.jira-key:hover { text-decoration: underline; }
.jira-summary { flex: 1; min-width: 0; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jira-role { font-size: 0.625rem; letter-spacing: 0.08em; padding: 1px 5px; border-radius: 4px; border: 1px solid currentColor; }
.jira-role-rel { color: var(--success); }
.jira-role-res { color: var(--warn); }
.jira-group-label { display: block; margin: var(--s4) 0 var(--s2); }

.agenda-day { margin-bottom: var(--s4); }
.agenda-day-label { display: block; margin-bottom: var(--s2); }
.agenda-item { display: flex; align-items: baseline; gap: var(--s3); padding: var(--s2) 0; border-bottom: 1px solid var(--hairline); }
.agenda-time { font-size: var(--step--1); color: var(--text); min-width: 4.5ch; }
.agenda-title { flex: 1; min-width: 0; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.pulls-line { font-size: var(--step--1); color: var(--text-muted); white-space: pre-wrap; word-break: break-word; }
.pulls-line a { color: var(--accent); }

.pulls-repos { margin-top: var(--s5); padding-top: var(--s3); border-top: 1px solid var(--hairline); }
.pulls-repos summary { font-size: var(--step--1); color: var(--text-faint); cursor: pointer; }
.pulls-repo-list { display: flex; flex-wrap: wrap; gap: var(--s2); margin: var(--s3) 0; }
.pulls-repo-add { display: flex; gap: var(--s2); }
```

- [ ] **Step 5: Rodar os três arquivos de teste**

Run: `npx vitest run tests/components/JiraPanel.test.tsx tests/components/AgendaPanel.test.tsx tests/components/PullsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/JiraPanel.tsx components/AgendaPanel.tsx components/PullsPanel.tsx tests/components/JiraPanel.test.tsx tests/components/AgendaPanel.test.tsx tests/components/PullsPanel.test.tsx app/globals.css
git commit -m "feat(ui): rebuild jira, agenda and pulls panels"
```

---

### Task 9: Sino de notificações e montagem do layout

**Files:**
- Rewrite: `components/NotificationsBell.tsx`, `app/page.tsx`
- Test: `tests/components/NotificationsBell.test.tsx` (atualizado)
- Modify: `app/globals.css` (classes `.bell-*`)

**Interfaces:**
- Consumes: `NowBand` (Task 5), todos os painéis (Tasks 6-8), `useDashboardState` (`lib/hooks/usePolling.ts`, inalterado).
- Produces: a página completa. `<NotificationsBell notifications={PanelResult<NotificationItem[]>} onChanged={() => void} />` mantém a assinatura de hoje.

Comportamento preservado: contador de não lidas; `POST /api/notifications/[id]/read` com checagem de `res.ok` e erro visível; link externo para a issue; "nada por aqui" quando vazio.

Novo: o sino vira um popover ancorado (não um bloco que empurra o layout), fecha com `Escape` e com clique fora.

- [ ] **Step 1: Atualizar o teste do sino**

`tests/components/NotificationsBell.test.tsx`:
```tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { NotificationsBell } from '@/components/NotificationsBell';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const items = [
  { id: 'A-1', source: 'jira_mention' as const, title: 'Mencionado em A-1', url: 'https://x/A-1', read: false },
  { id: 'A-2', source: 'jira_mention' as const, title: 'Mencionado em A-2', url: 'https://x/A-2', read: true },
];

describe('NotificationsBell', () => {
  it('mostra a contagem de não lidas', () => {
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={() => {}} />);
    expect(screen.getByRole('button', { name: /notificações/ }).textContent).toContain('1');
  });

  it('abre o painel e lista as notificações', () => {
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.getByText('Mencionado em A-1')).toBeInTheDocument();
  });

  it('marca como lida e avisa onChanged', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const onChanged = vi.fn();
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    fireEvent.click(screen.getByRole('button', { name: 'marcar Mencionado em A-1 como lida' }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/notifications/A-1/read', { method: 'POST' }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('mostra erro quando marcar falha', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'banco indisponível' }), { status: 502 }),
    );
    render(<NotificationsBell notifications={{ data: items, error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    fireEvent.click(screen.getByRole('button', { name: 'marcar Mencionado em A-1 como lida' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('banco indisponível'));
  });

  it('mostra o estado vazio quando não há notificações', () => {
    render(<NotificationsBell notifications={{ data: [], error: null }} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /notificações/ }));
    expect(screen.getByText(/nada por aqui/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/components/NotificationsBell.test.tsx`
Expected: FAIL — o nome acessível do botão de marcar mudou.

- [ ] **Step 3: Reescrever `components/NotificationsBell.tsx`**

Mantém a lógica de `markRead` (checando `res.ok`, erro em `role="alert"`, `onChanged` no sucesso). O botão do sino recebe `aria-label={\`notificações (${unreadCount} não lidas)\`}` e mostra o contador em `.bell-badge`. O painel vira `.bell-popover` com `role="dialog"`, fechando por `Escape` e por clique no backdrop invisível. Cada item de marcar recebe `aria-label={\`marcar ${item.title} como lida\`}`.

- [ ] **Step 4: Reescrever `app/page.tsx`**

```tsx
'use client';

import { useDashboardState } from '@/lib/hooks/usePolling';
import { NowBand } from '@/components/NowBand';
import { NotificationsBell } from '@/components/NotificationsBell';
import { EmailPanel } from '@/components/EmailPanel';
import { AgendaPanel } from '@/components/AgendaPanel';
import { PullsPanel } from '@/components/PullsPanel';
import { JiraPanel } from '@/components/JiraPanel';
import { TasksPanel } from '@/components/TasksPanel';

export default function DashboardPage() {
  const { state, loading, refreshNow, reload } = useDashboardState();

  return (
    <main className="shell">
      <NowBand
        pomodoro={state?.pomodoro ?? null}
        loading={loading}
        onRefresh={() => void refreshNow()}
        onChanged={reload}
        updatedAt={state?.updatedAt ?? null}
        bell={
          <NotificationsBell
            notifications={state?.notifications ?? { data: [], error: null }}
            onChanged={reload}
          />
        }
      />
      <div className="columns">
        <div className="col">
          <EmailPanel email={state?.email ?? { data: [], error: null }} onChanged={reload} />
          <TasksPanel tasks={state?.tasks ?? { data: [], error: null }} onChanged={reload} />
        </div>
        <div className="col">
          <AgendaPanel agenda={state?.agenda ?? { data: [], error: null }} />
          <JiraPanel jira={state?.jira ?? { data: [], error: null }} />
          <PullsPanel pulls={state?.pulls ?? { data: { lines: [] }, error: null }} onChanged={reload} />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Acrescentar as classes do sino ao fim de `app/globals.css`**

```css
.bell { position: relative; }

.bell-trigger { position: relative; }

.bell-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent);
  color: #16101F;
  font-size: 0.625rem;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
}

.bell-scrim { position: fixed; inset: 0; z-index: 40; }

.bell-popover {
  position: absolute;
  top: calc(100% + var(--s2));
  right: 0;
  z-index: 41;
  width: min(340px, calc(100vw - var(--s6)));
  max-height: 60vh;
  overflow-y: auto;
  padding: var(--s4);
  background: var(--surface);
  border: 1px solid var(--hairline-strong);
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(4, 2, 10, 0.55);
  animation: modal-in var(--med) var(--ease);
}

.bell-item { display: flex; flex-direction: column; gap: var(--s1); padding: var(--s3) 0; border-bottom: 1px solid var(--hairline); }
.bell-item.is-read { color: var(--text-faint); }
.bell-item a { color: var(--text); text-decoration: none; }
.bell-item a:hover { text-decoration: underline; }
.bell-item-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--s2); }
.bell-source { font-size: 0.625rem; letter-spacing: 0.08em; color: var(--text-faint); }
```

- [ ] **Step 6: Verificar build e suíte completa**

Run: `npm run build && npx vitest run`
Expected: build limpo; toda a suíte passa.

- [ ] **Step 7: Commit**

```bash
git add components/NotificationsBell.tsx app/page.tsx tests/components/NotificationsBell.test.tsx app/globals.css
git commit -m "feat(ui): rebuild notifications bell and assemble new layout"
```

---

### Task 10: Tela de login

**Files:**
- Rewrite: `app/login/page.tsx`
- Modify: `app/globals.css` (classes `.login-*`)

**Interfaces:**
- Consumes: tokens da Task 1, `AmbientBackground` já montado no layout raiz.
- Produces: nada consumido por outras tarefas.

Comportamento preservado: `POST /api/login` com `{username, password}`; em falha mostra `data.error` em `role="alert"`; em sucesso navega para `/`.

- [ ] **Step 1: Reescrever `app/login/page.tsx`**

```tsx
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
```

- [ ] **Step 2: Acrescentar as classes ao fim de `app/globals.css`**

```css
.login {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--s5);
}

.login-form {
  width: min(360px, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--s4);
}

.login-brand { display: flex; align-items: center; gap: var(--s3); }

.login-mark {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 22px 4px color-mix(in srgb, var(--accent) 45%, transparent);
}

.login-title { font-size: var(--step-2); font-weight: 500; letter-spacing: -0.01em; }
.login-sub { color: var(--text-muted); font-size: var(--step--1); margin-bottom: var(--s3); }
.login-field { display: flex; flex-direction: column; gap: var(--s2); font-size: var(--step--1); color: var(--text-muted); }
.login-field .field { min-height: 40px; }
.login-error { color: var(--danger); font-size: var(--step--1); }
.login-submit { min-height: 40px; margin-top: var(--s2); }
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx app/globals.css
git commit -m "feat(ui): redesign login screen"
```

---

### Task 11: Estados, movimento e verificação visual final

**Files:**
- Modify: painéis das Tasks 6-8 (skeletons e estados vazios finais)
- Modify: `app/globals.css` (animação de entrada, `.is-loading`)
- Modify: `app/page.tsx` (passa `loading` aos painéis)

**Interfaces:**
- Consumes: `SkeletonRows`, `EmptyState` (Task 3).
- Produces: nenhuma interface nova.

- [ ] **Step 1: Adicionar a animação de entrada coordenada ao fim de `app/globals.css`**

```css
@keyframes rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.now { animation: rise 420ms var(--ease) both; }
.columns > .col:first-child { animation: rise 420ms var(--ease) 60ms both; }
.columns > .col:last-child { animation: rise 420ms var(--ease) 120ms both; }

@media (prefers-reduced-motion: reduce) {
  .now, .columns > .col { animation: none; }
}
```

- [ ] **Step 2: Ligar os skeletons nos painéis**

Cada painel recebe uma prop opcional `loading?: boolean` e, quando `loading && (data ?? []).length === 0`, renderiza `<SkeletonRows count={5} />` no lugar da lista (mantendo o cabeçalho e a barra de filtros visíveis para não causar layout shift). `app/page.tsx` passa `loading={loading && !state}` para cada painel.

- [ ] **Step 3: Rodar a suíte completa e o build**

Run: `npx vitest run && npm run build`
Expected: tudo passa.

- [ ] **Step 4: Verificação visual em três larguras**

Subir o servidor de produção local (`npm run start`) e conferir com o navegador em 1440px, 834px e 390px:
- a faixa "agora" domina visualmente e não quebra;
- as duas colunas viram uma só em ≤1023px;
- a barra de filtros vira botão "filtrar" + folha em ≤639px;
- nenhuma rolagem horizontal;
- foco de teclado visível ao percorrer com Tab;
- estados vazio, erro e com filtro ativo aparecem corretamente.

Registrar o que foi conferido; corrigir o que estiver fora antes de commitar.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/page.tsx components
git commit -m "feat(ui): add loading skeletons, entrance motion and responsive polish"
```

---

## Self-Review

**1. Cobertura da spec:**
- Conceito, paleta, tipografia → Task 1. ✓
- Layout editorial assimétrico → Tasks 1 (CSS) + 9 (montagem). ✓
- Assinatura (fundo ambiente por hora + foco) → Task 2. ✓
- Sistema de filtros (busca, chips, ativos removíveis, limpar tudo, contador, client-side) → Task 4 (primitivos) + Tasks 6-8 (por painel). ✓
- Bottom sheet mobile → Task 4 (`Sheet` + `FilterBar`). ✓
- Responsividade desktop/tablet/mobile → Task 1 (breakpoints), Task 11 (verificação). ✓
- Movimento (entrada coordenada, transições curtas, skeletons, reduced-motion) → Tasks 1, 3, 11. ✓
- Acessibilidade (contraste, foco, teclado, semântica, não-só-cor, toque 44px, sem layout shift) → Tasks 1, 5, 7, 8, 11. ✓
- Estados (carregando, vazio, erro, populado, com filtro) → Tasks 3, 6-8, 11. ✓
- Login redesenhado → Task 10. ✓
- Preservação de todas as ações existentes → declarado explicitamente em cada tarefa de painel. ✓

**2. Placeholders:** nenhum "TBD"/"etc." em passo de código. As tarefas 6-8 descrevem a reescrita em prosa estruturada com a marcação exata das linhas e as regras de CSS completas, porque reproduzir o JSX inteiro dos cinco painéis duplicaria centenas de linhas já existentes no repositório — o comportamento a preservar está enumerado item a item em cada tarefa, e os testes atualizados (com código completo) são o contrato verificável.

**3. Consistência de tipos:** `ActiveFilter` definido na Task 4 e usado nas Tasks 6-8; `matchesQuery(fields, query)` com a mesma assinatura em todos os painéis; `ambientForHour(hour, focusing)` definido na Task 2 e consumido só pelo `AmbientBackground`; assinaturas de `<EmailPanel>`, `<TasksPanel>`, `<JiraPanel>`, `<AgendaPanel>`, `<PullsPanel>`, `<NotificationsBell>`, `<Clock>`, `<Pomodoro>` inalteradas em relação ao código atual (`app/page.tsx` da Task 9 as consome exatamente assim, mais a prop nova opcional `loading`).
