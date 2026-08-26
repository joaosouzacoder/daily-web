# daily-web — design

## Contexto

[`daily-tui`](https://github.com/joaosouzacoder/daily-tui) é um painel TUI em Rust que agrega e-mail, agenda, PRs, Jira, tarefas e um pomodoro para deixar rodando num monitor. Ele não fala diretamente com Gmail/Google/Jira/GitHub — só executa CLIs já instaladas e autenticadas na máquina (`himalaya`, `gcalcli`, `jira`, `mstodo`, `ghpending`) e formata a saída.

`daily-web` é a versão web do mesmo painel: mesmas features, acessível em um domínio próprio, atrás de login e senha, pensado para ficar aberto num segundo monitor. Não segue o layout do TUI — é uma página única, tema Catppuccin Mocha.

Roda nesta VPS (`srv1544093`, Hostinger, IP `187.127.5.71`), a mesma que já hospeda o PergunteAI atrás de Traefik. As CLIs de dados são instaladas e autenticadas **nesta VPS**, separadas das contas já configuradas no notebook do usuário — cada credencial é própria desta máquina.

## Arquitetura

App Next.js 16 (App Router, TypeScript) único deployável: front-end one-page + API routes no mesmo processo. Roda como processo de host via `systemd` (não Docker) — as CLIs de e-mail/agenda precisam de acesso a keyring/secret-service, mais simples fora de container.

Um módulo "refresher" no servidor (singleton, iniciado no boot do processo) roda cada CLI via `child_process` em intervalo configurável (`REFRESH_SECONDS`, default 300, mesmo default do daily-tui), faz parse da saída e mantém o estado em cache em memória. O front-end faz polling de `GET /api/state` a cada ~20s (só lê o cache, não reexecuta CLI); um botão "atualizar agora" chama `POST /api/refresh` (equivalente ao `r` do TUI, refresh imediato de tudo). Sem WebSocket/SSE — desnecessário para um usuário só.

Painel com erro de credencial mostra o erro no lugar dos dados — o resto do painel continua funcionando, mesmo comportamento do daily-tui.

## Autenticação

Login único: usuário + senha vindos de env vars (`DASHBOARD_USER`, `DASHBOARD_PASSWORD_HASH` — bcrypt), sem tabela de usuários. Cookie de sessão assinado (httpOnly, secure, sameSite=strict, 30 dias, segredo em `SESSION_SECRET`). Middleware do Next protege todas as rotas exceto `/login` e assets estáticos. Rate-limit simples em memória por IP (N tentativas, cooldown) contra brute-force — sem infra extra.

Nenhum segredo (senha, tokens, secrets de OAuth) entra no repositório. Tudo vem de variáveis de ambiente carregadas pelo `systemd` a partir de um `EnvironmentFile` fora do git (`/etc/daily-web/env`, análogo ao que outras apps desta VPS já fazem). O repo traz só `.env.example` documentando as chaves.

## Painéis (paridade completa com daily-tui)

| Painel | Fonte | Comportamento web |
|---|---|---|
| Relógio | — | client-side, atualiza a cada segundo, data por extenso pt-BR |
| Pomodoro | config | iniciar/pausar/reset; notificação via Browser Notification API + fallback ntfy.sh (`NTFY_TOPIC`) |
| E-mail | `himalaya` (work+personal) | lista por conta, ler corpo sob demanda (fetch em background ao focar item), marcar lido/não lido, mover (seletor de pastas do servidor), excluir (lixeira, com confirmação), seleção em lote |
| Agenda | `gcalcli` (2 contas) | somente leitura, próximos 7 dias, agregada |
| PRs/Issues | `ghpending` | somente leitura, digest com link para abrir |
| Jira | helper `jira` | lista, agrupar por pai, ciclar filtro (minhas/relator/ambas), abrir issue no navegador |
| Notificações | SQLite | painel com o que pede atenção (hoje: menções Jira nos últimos 30 dias), marcar como lida — persistente, não volta |
| Tarefas | helper `mstodo` | CRUD completo: criar/editar/concluir/apagar, subtarefas (checklist), prioridade, recorrência, parsing de data (`hoje`, `amanhã`, `+3d`, `AAAA-MM-DD` + hora opcional), agrupamento por prazo (atrasadas/hoje/semana/mês/depois/sem data) |

Comportamentos detalhados de cada painel (regras de agrupamento, parsing de data, marcadores de papel no Jira, etc.) seguem exatamente o que já está documentado no [README do daily-tui](https://github.com/joaosouzacoder/daily-tui#teclas) — a spec não reproduz esse detalhamento, só referencia.

## Persistência

SQLite (`better-sqlite3`), uma tabela: `notifications_read(source, external_id, read_at)` — único estado que precisa sobreviver a restart do servidor. Cache de pastas de e-mail e contador de pomodoro ficam em memória: o processo roda continuamente (diferente do TUI, que abre/fecha com frequência), então perder esse estado num restart raro é aceitável.

## Layout (Catppuccin Mocha, one-page)

- Topo: relógio + pomodoro lado a lado.
- Grid de cards abaixo: e-mail e agenda numa linha, Jira e tarefas noutra, PRs como faixa compacta.
- Sino de notificações fixo no canto superior direito, abre painel flutuante.
- Leitura de e-mail e formulário de tarefa abrem em modal/slide-over.
- Paleta Catppuccin Mocha: base `#1e1e2e`, cards `#313244`, texto `#cdd6f4`, accents (verde `#a6e3a1`, lilás `#cba6f7`, vermelho `#f38ba8`) para status/prioridade.

## Deploy nesta VPS

Mesmo padrão do PergunteAI: processo host via `systemd` (usuário dedicado), escutando em `127.0.0.1:8010`. Nova entrada no `dynamic.yml` (file provider) do Traefik existente, roteando `Host(\`dashboard.exemplo.com\`)` → `http://127.0.0.1:8010`, TLS via `letsencrypt` (Cloudflare em modo Full/Strict, mesmo esquema do pergunteai). Registro DNS no Cloudflare é responsabilidade do usuário.

Deploy manual (`scripts/deploy.sh`: `git pull` + `npm ci` + `npm run build` + `systemctl restart daily-web`) — sem CI/CD, não se justifica para uma ferramenta pessoal.

## Autenticação headless das CLIs (fora do escopo desta spec)

Autenticar `gcalcli` (OAuth Google Cloud) e `himalaya`/`ortie` (OAuth + keyring) numa VPS sem GUI é mais trabalhoso que num notebook. `jira`, `ghpending` e `mstodo` são triviais (env vars / device code, já funcionam headless). Essa configuração é uma fase própria do plano de implementação, reaproveitando os scripts `setup-auth.sh` do daily-tui adaptados para rodar sem navegador local. O app deve funcionar (com os painéis correspondentes mostrando erro) mesmo antes dessa etapa estar completa.

## Testes

- Unitários para os parsers de cada CLI (saída de `himalaya -o json`, `gcalcli` TSV, `jira`/`mstodo` JSON, `ghpending`), com fixtures gravadas de saídas reais.
- Testes de integração das API routes de escrita (mock de `child_process`).
- Sem teste E2E de UI nesta primeira versão — escopo já grande; pode entrar depois se justificar.

## Fora de escopo

- Multi-usuário / múltiplas contas de login.
- App mobile ou PWA com push nativo (o fallback ntfy.sh já cobre celular).
- CI/CD automatizado.
- Suporte a mais de duas contas de e-mail/agenda (mesma limitação do daily-tui).
