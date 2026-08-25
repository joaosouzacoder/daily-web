# daily-web — redesign visual completo

## Contexto

O daily-web (spec original em [`2026-08-25-daily-web-design.md`](2026-08-25-daily-web-design.md)) está implementado, em produção, com 25 tarefas completas e todos os painéis funcionando com dados reais. A camada visual atual, porém, herdou decisões do daily-tui (grid de cards, tema Catppuccin Mocha literal) que não usam a liberdade da web — o resultado lê como um dashboard administrativo genérico, não como um produto premium.

Este documento cobre **apenas a camada de apresentação**: navegação, hierarquia visual, layout, filtros/busca, responsividade, movimento e acessibilidade. Nenhuma funcionalidade, rota de API, integração com CLI ou fluxo de dados muda — o redesign consome exatamente os mesmos dados e ações que já existem.

**Referência de funcionalidades a preservar** (não de estilo): todos os painéis e ações já documentados na spec original — e-mail (listar/ler/marcar/mover/excluir/lote), agenda (leitura), Jira (listar/agrupar/filtrar), tarefas (CRUD completo + subtarefas), PRs (leitura + gerenciar repos rastreados), pomodoro (iniciar/pausar/zerar), notificações (marcar como lida).

## Direção visual

### Conceito

O produto não é um "dashboard administrativo" — é um instrumento pessoal, sempre ligado, visto de relance de outro monitor. Esse uso (glanceable, always-on) guia toda decisão: hierarquia extrema (uma coisa domina a tela), zero ruído decorativo, e uma única ideia visual marcante que faz sentido especificamente para "uma tela que fica sempre aberta".

### Paleta

Mantém a essência escura/arroxeada do Catppuccin Mocha como ponto de partida conceitual, mas com uma paleta própria — nenhum valor é copiado literalmente do tema.

| Token | Valor | Uso |
|---|---|---|
| `--canvas` | `#0D0B14` | fundo base |
| `--surface` | `#17141F` | inputs, modais, elementos elevados |
| `--surface-hover` | `#211C2E` | hover/foco |
| `--hairline` | `#2C2740` | divisórias estruturais (nunca borda de card) |
| `--text` | `#F0EDF7` | texto primário |
| `--text-muted` | `#9891AC` | texto secundário |
| `--accent` | `#B48CFF` | violeta elevado — ações primárias, foco ativo, anel de foco (uso deliberadamente restrito) |
| `--success` | `#7FDBB0` | concluído, lido |
| `--warn` | `#FF9B7A` | atrasado, atenção |
| `--danger` | `#FF6B81` | exclusão, destrutivo (uso raro) |

Modo único, escuro. Sem alternância de tema (decisão já validada com o usuário — combina com o uso "sempre aberto num monitor").

### Tipografia

- **Geist Sans** — face de UI para todo conteúdo, rótulos e botões. Carregada via o pacote npm `geist` (`geist/font/sans`, self-hosted pelo Next.js via `next/font`, sem chamada externa em runtime), variável, pesos 400/500/600.
- **Geist Mono** — para horários, datas, chaves do Jira, contadores. Carregada via `geist/font/mono`. Reforça "instrumento de precisão" sem virar terminal literal.
- Escala tipográfica: hero do relógio em `clamp(3.5rem, 8vw, 6rem)`; rótulos eyebrow em `0.75rem` uppercase com tracking; corpo em `0.9375rem`; nada abaixo de `0.75rem` em texto interativo (acessibilidade).

### Layout

Abandono total do grid de cards quadrados (`.dashboard-grid` atual). Estrutura editorial:

1. **Faixa "agora"** (full-width, topo): relógio + data por extenso + estado do pomodoro, unificados como um único momento visual dominante — não duas caixas lado a lado.
2. **Duas colunas assimétricas** (desktop): coluna larga (E-mail, Tarefas — mais densos/interativos) + coluna estreita (Agenda, Jira, PRs — mais glanceable).
3. Seções separadas por linha fina (`--hairline`) + rótulo eyebrow (ex.: "INBOX", "TAREFAS") — nunca por fundo de card ou borda arredondada em caixa.
4. Sino de notificações fixo no canto superior direito da faixa "agora", abre painel flutuante (mantém comportamento já existente, só a apresentação muda).

### Assinatura visual

O fundo inteiro da página é um **segundo relógio ambiente**: gradiente muito sutil que muda de tom conforme a hora real do dia (violeta frio de madrugada → quente ao meio-dia → violeta profundo à noite) e se intensifica discretamente durante uma sessão de foco do pomodoro. Implementado em CSS puro (custom properties atualizadas por um pequeno hook client-side que lê a hora local a cada minuto — nenhuma chamada de rede), com `prefers-reduced-motion` desativando a transição suave (troca instantânea de tom, sem animação).

## Sistema de filtros e busca

Cada painel denso ganha uma barra de filtro fina, inline, no topo da própria seção — não uma página de filtros separada.

**E-mail**: busca textual (assunto/remetente, client-side sobre os dados já carregados), toggle lido/não lido, ordenação (mais recente / mais antigo). Seleção em lote e ações continuam como já implementado.

**Tarefas**: busca textual, filtro de prioridade (todas/alta/normal/baixa), os agrupamentos por prazo já existentes (atrasadas/hoje/semana/mês/depois/sem data) passam a funcionar como chips de período rápido clicáveis que fazem scroll/destacam a faixa correspondente, em vez de só serem cabeçalhos passivos.

**Jira**: mantém o ciclo de filtro já existente (minhas/relator/ambas) e agrupar-por-pai, apresentados como chips em vez de texto de rodapé.

Comportamento comum a todos: filtros ativos aparecem como chips removíveis individualmente; ação "limpar tudo" quando há mais de um filtro ativo; contador de resultados (“12 de 34”) quando um filtro reduz a lista; toda combinação de filtro é 100% client-side sobre os dados já em memória — nenhuma requisição nova ao aplicar/remover filtro (os dados já vêm completos de `/api/state`).

Em mobile, a barra de filtro de cada seção colapsa num botão "filtrar" que abre uma folha de tela cheia (bottom sheet) com os mesmos controles, resumo das escolhas e botão explícito "aplicar".

## Responsividade

- **Desktop** (`≥1024px`): duas colunas assimétricas como descrito acima.
- **Tablet** (`640–1023px`): coluna única; E-mail e Tarefas mantêm largura total; Agenda/Jira/PRs viram uma "prateleira" horizontal com scroll suave (não comprimidos verticalmente).
- **Mobile** (`<640px`): tudo empilhado na ordem de prioridade (faixa "agora" primeiro, depois E-mail, Tarefas, Agenda, Jira, PRs); faixa "agora" condensa para um cabeçalho compacto e fixo (sticky) ao rolar; filtros viram bottom sheet; nenhuma rolagem horizontal fora da prateleira de tablet; áreas de toque mínimas de 44×44px; respeita safe-area-inset em iOS.

## Movimento

- Entrada coordenada única no carregamento inicial (faixa "agora" e colunas aparecem em sequência curta, não simultânea) — um momento orquestrado, não múltiplos.
- Transições de estado (abrir modal, aplicar filtro, marcar como lido) em ≤200ms, easing padrão do sistema.
- Skeletons que espelham a estrutura real de cada seção durante carregamento (não um spinner genérico).
- Toda animação de mudança de cor ambiente e transições de entrada respeitam `prefers-reduced-motion: reduce` (troca instantânea, sem transição).
- Hover/pressed states discretos (mudança de `--surface` para `--surface-hover`, sem escala/sombra dramática).

## Acessibilidade

- Contraste mínimo AA em todo texto sobre `--canvas`/`--surface` (validado nos tokens acima).
- Foco de teclado sempre visível (anel usando `--accent`, nunca `outline: none` sem substituto).
- Navegação por teclado completa (tab order lógico, ações de painel alcançáveis sem mouse).
- HTML semântico (`nav`, `section`, `h2` por painel, `role="alert"` já usado nos erros é mantido).
- Estados nunca comunicados só por cor (ex.: prioridade alta usa texto/ícone além da cor de destaque).
- `prefers-reduced-motion` respeitado em toda animação (ver seção Movimento).
- Sem layout shift durante carregamento (skeletons ocupam o espaço final real).

## Estados

Cada painel implementa explicitamente: carregando (skeleton), vazio (mensagem específica do painel — "sem e-mails não lidos", "nenhuma tarefa para hoje" — nunca um espaço em branco), erro (mantém `PanelResult.error` já existente, com tratamento visual consistente), populado, e populado-com-filtro-ativo (mostra contador "X de Y").

## Escopo

**Dentro**: `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, todos os componentes em `components/` (Clock, Pomodoro, EmailPanel, AgendaPanel, PullsPanel, JiraPanel, TasksPanel, TaskFormModal, NotificationsBell), `app/login/page.tsx` (a tela de login também é refeita para bater com a nova identidade visual).

**Fora**: qualquer rota de API, `lib/cli/*`, `lib/parsers/*`, `middleware.ts`, `instrumentation.ts`, schema do banco, autenticação, contrato de dados (`PanelResult<T>`, `DashboardState` etc. não mudam). Testes de comportamento (não de snapshot visual) continuam validando a mesma lógica de negócio — testes que dependiam de texto/estrutura DOM específica da versão antiga são atualizados para a nova marcação, mas o que é testado (o quê, não a aparência) não muda.

## Testes

Componentes mantêm cobertura de comportamento (o que cada ação faz), reescrita contra a nova marcação. Nenhum teste de regressão visual (screenshot) é adicionado nesta spec — verificação visual é feita manualmente em desktop/tablet/mobile antes de considerar o redesign concluído, conforme o processo esperado no pedido original.
